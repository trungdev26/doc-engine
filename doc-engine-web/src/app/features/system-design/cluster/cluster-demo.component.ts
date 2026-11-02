import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import { Edge, Graph, Node } from '@antv/x6';

interface ClusterEntity {
  x: number;
  y: number;
  radius: number;
  label: string;
}

interface AppNode extends ClusterEntity {
  id: number;
  active: boolean;
  requestCount: number;
  graphNode?: Node;
  edge?: Edge;
}

const NODE_CENTER_X = 730;
const MAX_NODE_RADIUS = 56;
const MIN_NODE_RADIUS = 24;
const NODE_EDGE_GAP = 20;
const MAX_VERTICAL_SPAN = 480;

@Component({
  selector: 'app-cluster-demo',
  templateUrl: './cluster-demo.component.html',
  styleUrls: ['./cluster-demo.component.scss'],
})
export class ClusterDemoComponent implements AfterViewInit, OnDestroy {
  readonly client: ClusterEntity = { x: 108, y: 260, radius: 50, label: 'Client' };
  readonly loadBalancer: ClusterEntity = { x: 390, y: 252, radius: 62, label: 'Load Balancer' };

  nodes: AppNode[] = [
    { id: 1, active: true, requestCount: 0, x: NODE_CENTER_X, y: 0, radius: MAX_NODE_RADIUS, label: '' },
    { id: 2, active: true, requestCount: 0, x: NODE_CENTER_X, y: 0, radius: MAX_NODE_RADIUS, label: '' },
    { id: 3, active: true, requestCount: 0, x: NODE_CENTER_X, y: 0, radius: MAX_NODE_RADIUS, label: '' },
  ];
  inFlightRequests: Node[] = [];

  private graph?: Graph;
  private clientNode?: Node;
  private loadBalancerNode?: Node;
  private clientEdge?: Edge;
  private roundRobinIndex = -1;
  private nodeIdCounter = 4;
  private requestIdCounter = 1;
  private readonly timers: number[] = [];

  @ViewChild('graphContainer', { static: true })
  private graphContainer!: ElementRef<HTMLElement>;

  get activeNodeCount(): number {
    return this.nodes.filter(node => node.active).length;
  }

  get failedNodeCount(): number {
    return this.nodes.length - this.activeNodeCount;
  }

  get handledRequestCount(): number {
    return this.nodes.reduce((total, node) => total + node.requestCount, 0);
  }

  ngAfterViewInit(): void {
    this.updateNodePositions();
    this.timers.push(
      window.setTimeout(() => {
        this.createGraph();
        this.rebuildGraphCells();
      }),
    );
  }

  ngOnDestroy(): void {
    this.timers.forEach(timer => window.clearTimeout(timer));
    this.graph?.dispose();
  }

  addNode(): void {
    if (this.nodes.length >= 8) {
      return;
    }

    const node: AppNode = {
      id: this.nodeIdCounter++,
      active: true,
      requestCount: 0,
      x: NODE_CENTER_X,
      y: 0,
      radius: MAX_NODE_RADIUS,
      label: '',
    };

    node.graphNode = this.graph?.addNode(this.createAppNodeConfig(node));
    this.nodes = [...this.nodes, node];
    this.updateNodePositions();
    this.graph ? this.rebuildGraphCells() : this.syncGraph();
  }

  removeNode(): void {
    if (this.nodes.length <= 1) {
      return;
    }

    const removedNode = this.nodes[this.nodes.length - 1];
    this.nodes = this.nodes.slice(0, -1);
    removedNode.edge?.remove();
    removedNode.graphNode?.remove();
    this.updateNodePositions();
    this.graph ? this.rebuildGraphCells() : this.syncGraph();
  }

  failNode(): void {
    const activeNodes = this.nodes.filter(node => node.active);
    if (!activeNodes.length) {
      return;
    }

    const failedNode = activeNodes[Math.floor(Math.random() * activeNodes.length)];
    failedNode.active = false;
    this.syncGraph();
  }

  recoverNodes(): void {
    this.nodes.forEach(node => {
      node.active = true;
    });
    this.syncGraph();
  }

  resetRequests(): void {
    this.inFlightRequests.forEach(token => token.remove());
    this.inFlightRequests = [];
    this.nodes.forEach(node => {
      node.requestCount = 0;
    });
    this.roundRobinIndex = -1;
    this.syncGraph();
  }

  sendRequests(count: number): void {
    for (let i = 0; i < count; i++) {
      this.timers.push(window.setTimeout(() => this.routeRequest(), i * 180));
    }
  }

  private rebuildGraphCells(): void {
    if (!this.graph) {
      return;
    }

    const graphNodes = [
      {
        id: 'cluster-client',
        shape: 'circle',
        ...this.circleBounds(this.client),
        zIndex: 10,
        attrs: this.entityAttrs('#4b5563', 'Client', 'Browser / Mobile', true),
      },
      {
        id: 'cluster-lb',
        shape: 'circle',
        ...this.circleBounds(this.loadBalancer),
        zIndex: 10,
        attrs: this.entityAttrs('#2563eb', 'Load Balancer', 'health check + route', true),
      },
      ...this.nodes.map(node => this.createAppNodeConfig(node)),
    ];

    const graphEdges = [
      this.createEdgeConfig('cluster-client', 'cluster-lb', '#64748b', 'cluster-client-edge'),
      ...this.nodes.map(node =>
        this.createEdgeConfig('cluster-lb', `cluster-app-node-${node.id}`, node.active ? '#64748b' : '#fecaca', `cluster-node-edge-${node.id}`),
      ),
    ];

    this.graph.fromJSON({ nodes: graphNodes, edges: graphEdges });
    this.clientNode = this.graph.getCellById('cluster-client') as Node;
    this.loadBalancerNode = this.graph.getCellById('cluster-lb') as Node;
    this.clientEdge = this.graph.getCellById('cluster-client-edge') as Edge;

    this.nodes.forEach(node => {
      node.graphNode = this.graph!.getCellById(`cluster-app-node-${node.id}`) as Node;
      node.edge = this.graph!.getCellById(`cluster-node-edge-${node.id}`) as Edge;
    });
  }

  private createGraph(): void {
    this.graph = new Graph({
      container: this.graphContainer.nativeElement,
      width: this.graphContainer.nativeElement.clientWidth,
      height: 520,
      grid: {
        size: 10,
        visible: true,
        type: 'mesh',
        args: { color: '#eef2f7', thickness: 1 },
      },
      interacting: false,
      panning: false,
      mousewheel: false,
      background: { color: '#f8fafc' },
    });
  }

  private routeRequest(): void {
    const targetNode = this.getNextActiveNode();
    if (!targetNode || !this.graph || !this.clientNode || !this.loadBalancerNode || !targetNode.graphNode) {
      return;
    }

    this.highlightEdge(this.clientEdge);
    this.highlightEdge(targetNode.edge);

    const start = this.tokenPosition(this.client);
    const token = this.graph.addNode({
      id: `request-token-${this.requestIdCounter++}`,
      shape: 'circle',
      x: start.x,
      y: start.y,
      width: 18,
      height: 18,
      zIndex: 99,
      attrs: {
        body: {
          fill: '#faad14',
          stroke: '#ad6800',
          strokeWidth: 2,
        },
      },
    });

    this.inFlightRequests = [...this.inFlightRequests, token];
    this.animateToken(token, this.loadBalancer, 420);

    this.timers.push(
      window.setTimeout(() => {
        if (!targetNode.active) {
          const nextNode = this.getNextActiveNode();
          if (!nextNode?.graphNode) {
            this.removeRequestToken(token);
            return;
          }
          this.animateToken(token, nextNode, 560);
          this.finishRequest(token, nextNode, 600);
          return;
        }

        this.animateToken(token, targetNode, 560);
        this.finishRequest(token, targetNode, 600);
      }, 430),
    );
  }

  private tokenPosition(entity: ClusterEntity): { x: number; y: number } {
    return { x: entity.x - 9, y: entity.y - 9 };
  }

  private animateToken(token: Node, target: ClusterEntity, duration: number): void {
    const pos = this.tokenPosition(target);
    token.animate({ 'position/x': pos.x, 'position/y': pos.y }, { duration, easing: 'ease-in-out-quad' });
  }

  private updateNodePositions(): void {
    const radius = this.computeNodeRadius(this.nodes.length);
    const spacing = this.nodes.length > 1 ? radius * 2 + NODE_EDGE_GAP : 0;
    const startY = 258 - (spacing * (this.nodes.length - 1)) / 2;

    this.nodes.forEach((node, index) => {
      node.radius = radius;
      node.y = startY + index * spacing;
      node.label = `Node ${node.id}`;
      node.graphNode?.resize(radius * 2, radius * 2);
      node.graphNode?.position(node.x - radius, node.y - radius);
    });
  }

  private computeNodeRadius(count: number): number {
    if (count <= 1) {
      return MAX_NODE_RADIUS;
    }

    const idealSpacing = MAX_VERTICAL_SPAN / (count - 1);
    const radius = (idealSpacing - NODE_EDGE_GAP) / 2;
    return Math.max(MIN_NODE_RADIUS, Math.min(MAX_NODE_RADIUS, radius));
  }

  private getNextActiveNode(): AppNode | null {
    const activeNodes = this.nodes.filter(node => node.active);
    if (!activeNodes.length) {
      return null;
    }

    this.roundRobinIndex = (this.roundRobinIndex + 1) % activeNodes.length;
    return activeNodes[this.roundRobinIndex];
  }

  private finishRequest(token: Node, targetNode: AppNode, delay: number): void {
    this.timers.push(
      window.setTimeout(() => {
        targetNode.requestCount++;
        this.removeRequestToken(token);
        this.syncGraph();
      }, delay),
    );
  }

  private removeRequestToken(token: Node): void {
    token.remove();
    this.inFlightRequests = this.inFlightRequests.filter(item => item !== token);
  }

  private syncGraph(): void {
    if (!this.graph || !this.loadBalancerNode) {
      return;
    }

    this.nodes.forEach(node => {
      if (!node.graphNode) {
        return;
      }

      node.graphNode.attr(this.entityAttrs(node.active ? '#22a06b' : '#d9363e', node.label, `Reqs: ${node.requestCount}`, node.active));

      if (!node.edge) {
        node.edge = this.graph!.addEdge(this.createEdgeConfig(this.loadBalancerNode!, node.graphNode, node.active ? '#64748b' : '#fecaca'));
      } else {
        node.edge.attr('line/stroke', node.active ? '#64748b' : '#fecaca');
        node.edge.attr('line/strokeWidth', node.active ? 2 : 1.5);
      }
    });
  }

  private createAppNodeConfig(node: AppNode) {
    return {
      id: `cluster-app-node-${node.id}`,
      shape: 'circle',
      ...this.circleBounds(node),
      zIndex: 10,
      attrs: this.entityAttrs(node.active ? '#22a06b' : '#d9363e', `Node ${node.id}`, 'Reqs: 0', node.active),
    };
  }

  private circleBounds(entity: ClusterEntity): { x: number; y: number; width: number; height: number } {
    return {
      x: entity.x - entity.radius,
      y: entity.y - entity.radius,
      width: entity.radius * 2,
      height: entity.radius * 2,
    };
  }

  private createEdgeConfig(source: Node | string, target: Node | string, color: string, id?: string) {
    return {
      id,
      source,
      target,
      zIndex: 1,
      connector: { name: 'smooth' },
      attrs: {
        line: {
          stroke: color,
          strokeWidth: 2,
          targetMarker: {
            name: 'block',
            width: 8,
            height: 6,
          },
        },
      },
    };
  }

  private entityAttrs(fill: string, title: string, subtitle: string, active: boolean) {
    return {
      body: {
        fill,
        stroke: active ? '#0f172a' : '#7f1d1d',
        strokeWidth: active ? 1.5 : 2,
        strokeDasharray: active ? '0' : '5,3',
        opacity: active ? 1 : 0.8,
        filter: {
          name: 'dropShadow',
          args: {
            dx: 0,
            dy: active ? 8 : 3,
            blur: active ? 12 : 6,
            color: active ? 'rgba(15, 23, 42, 0.18)' : 'rgba(217, 54, 62, 0.35)',
          },
        },
      },
      label: {
        text: active ? `${title}\n${subtitle}` : `${title}\n✕ ${subtitle}`,
        fill: '#ffffff',
        fontSize: 12,
        fontWeight: 700,
        lineHeight: 16,
      },
    };
  }

  private highlightEdge(edge?: Edge): void {
    if (!edge) {
      return;
    }

    edge.attr('line/stroke', '#faad14');
    edge.attr('line/strokeWidth', 4);
    this.timers.push(
      window.setTimeout(() => {
        edge.attr('line/stroke', '#64748b');
        edge.attr('line/strokeWidth', 2);
      }, 900),
    );
  }
}
