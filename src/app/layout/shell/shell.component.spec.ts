import { Router } from '@angular/router';
import { ShellComponent } from './shell.component';

describe('ShellComponent sidebar resize listeners', () => {
  it('registers pointer listeners only for an active resize', () => {
    const component = new ShellComponent({} as Router);
    spyOnProperty(window, 'innerWidth').and.returnValue(1200);
    const addListener = spyOn(document, 'addEventListener');
    const removeListener = spyOn(document, 'removeEventListener');
    const event = { clientX: 320, preventDefault: jasmine.createSpy('preventDefault') };

    expect(addListener).not.toHaveBeenCalled();

    component.startSidebarResize(event as unknown as PointerEvent);

    expect(addListener).toHaveBeenCalledWith('pointermove', jasmine.any(Function));
    expect(addListener).toHaveBeenCalledWith('pointerup', jasmine.any(Function));
    expect(addListener).toHaveBeenCalledWith('pointercancel', jasmine.any(Function));

    component.stopSidebarResize();

    expect(removeListener).toHaveBeenCalledWith('pointermove', jasmine.any(Function));
    expect(removeListener).toHaveBeenCalledWith('pointerup', jasmine.any(Function));
    expect(removeListener).toHaveBeenCalledWith('pointercancel', jasmine.any(Function));
  });
});
