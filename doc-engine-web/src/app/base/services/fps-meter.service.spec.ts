import { NgZone } from '@angular/core';
import { FpsMeterService } from './fps-meter.service';

describe('FpsMeterService', () => {
  it('publishes FPS without re-entering the Angular zone', () => {
    let frameCallback!: FrameRequestCallback;
    const ngZone = {
      runOutsideAngular: (callback: () => void) => callback(),
      run: jasmine.createSpy('run'),
    } as unknown as NgZone;
    spyOn(window, 'requestAnimationFrame').and.callFake(callback => {
      frameCallback = callback;
      return 1;
    });
    spyOn(performance, 'now').and.returnValue(0);
    const publish = jasmine.createSpy('publish');
    const service = new FpsMeterService(ngZone);

    (service.start as unknown as (callback: (fps: number) => void) => void)(publish);
    frameCallback(500);

    expect(publish).toHaveBeenCalledOnceWith(2);
    expect(ngZone.run).not.toHaveBeenCalled();
  });
});
