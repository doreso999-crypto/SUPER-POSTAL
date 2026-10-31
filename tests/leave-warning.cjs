const fs = require('node:fs');
const assert = require('node:assert/strict');
const src = fs.readFileSync('superpostal.js', 'utf8');
const start = src.indexOf('    const NAVIGATION_GRACE_MS=');
const end = src.indexOf('    function tick(){', start);
assert.ok(start >= 0 && end > start, 'navigation warning module exists');
const excerpt = src.slice(start, end);

function page(approved = false) {
    const listeners = {}, navigationListeners = {};
    const document = { addEventListener(type, fn) { listeners[type] = fn; } };
    const window = { navigation: { addEventListener(type, fn) { navigationListeners[type] = fn; } } };
    const read = key => key.startsWith('job:') ? { id: '33', session: 'client', approved } : { ended: false };
    const factory = new Function('window', 'document', 'read', 'id', 'isApproved',
        excerpt + '\nreturn { trackNormalNavigation, warnIfLeaving };');
    const api = factory(window, document, read, () => '33', record => !!record.approved);
    api.trackNormalNavigation();
    function warns() {
        const event = { defaultPrevented: false, returnValue: null,
            preventDefault() { this.defaultPrevented = true; } };
        api.warnIfLeaving(event);
        return event.defaultPrevented;
    }
    return { listeners, navigationListeners, warns };
}

assert.equal(page().warns(), true, 'unapproved close triggers warning');
assert.equal(page(true).warns(), false, 'approved close is silent');

let p = page();
p.navigationListeners.navigate({ navigationType: 'reload', hashChange: false, downloadRequest: null });
assert.equal(p.warns(), false, 'browser refresh is silent');

p = page();
p.navigationListeners.navigate({ navigationType: 'traverse', hashChange: false, downloadRequest: null });
assert.equal(p.warns(), false, 'browser back/forward is silent');

p = page();
p.listeners.click({ button: 0, defaultPrevented: false,
    target: { closest: () => ({ target: '', hasAttribute: () => false, getAttribute: () => '/jobui' }) } });
assert.equal(p.warns(), false, 'normal link navigation is silent');

p = page();
p.listeners.submit({ defaultPrevented: false });
assert.equal(p.warns(), false, 'form submissions are silent');

p = page();
p.listeners.keydown({ key: 'r', ctrlKey: true });
assert.equal(p.warns(), false, 'Ctrl+R is silent');

p = page();
p.navigationListeners.navigate({ navigationType: 'push', hashChange: true, downloadRequest: null });
assert.equal(p.warns(), true, 'hash change does not suppress a later close');

console.log('PASS: close warning only on otherwise-unrecognized unloads, not approved jobs or recognized navigation/reloads.');
