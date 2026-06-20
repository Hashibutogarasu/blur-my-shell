import Gio from 'gi://Gio';
import Shell from 'gi://Shell';

const BUS_NAME = 'io.github.jeffshee.Hidamari.server';
const OBJ_PATH = '/';
const IFACE_XML = `
<node>
  <interface name='io.github.jeffshee.hidamari.server'>
    <property name="is_playing" type="b" access="read"/>
  </interface>
</node>`;

/// Watches the Hidamari video wallpaper DBus service and calls `on_mode_change`
/// with Shell.BlurMode.ACTOR when a video is playing, and Shell.BlurMode.BACKGROUND
/// otherwise, so callers can switch the blur sampler dynamically.
export class HidamariCompatibility {
    constructor(on_mode_change, on_warn) {
        this._on_mode_change = on_mode_change;
        this._on_warn = on_warn;
        this._watcher_id = 0;
        this._proxy = null;
        this._proxy_signal_id = 0;
    }

    enable() {
        this._watcher_id = Gio.DBus.session.watch_name(
            BUS_NAME,
            Gio.BusNameWatcherFlags.NONE,
            () => this._on_appeared(),
            () => this._on_vanished()
        );
    }

    disable() {
        if (this._watcher_id) {
            Gio.DBus.session.unwatch_name(this._watcher_id);
            this._watcher_id = 0;
        }
        this._destroy_proxy();
        this._on_mode_change(Shell.BlurMode.BACKGROUND);
    }

    _on_appeared() {
        try {
            const HidamariProxy = Gio.DBusProxy.makeProxyWrapper(IFACE_XML);
            this._proxy = new HidamariProxy(
                Gio.DBus.session,
                BUS_NAME,
                OBJ_PATH,
                null,
                Gio.DBusProxyFlags.DO_NOT_AUTO_START
            );
            this._proxy_signal_id = this._proxy.connect(
                'g-properties-changed',
                () => this._update_mode()
            );
            this._update_mode();
        } catch (e) {
            this._on_warn(`could not connect to Hidamari DBus: ${e}`);
        }
    }

    _on_vanished() {
        this._destroy_proxy();
        this._on_mode_change(Shell.BlurMode.BACKGROUND);
    }

    _destroy_proxy() {
        if (this._proxy) {
            if (this._proxy_signal_id) {
                this._proxy.disconnect(this._proxy_signal_id);
                this._proxy_signal_id = 0;
            }
            this._proxy = null;
        }
    }

    _update_mode() {
        const val = this._proxy?.get_cached_property('is_playing');
        const is_playing = val ? val.unpack() : false;
        this._on_mode_change(
            is_playing ? Shell.BlurMode.ACTOR : Shell.BlurMode.BACKGROUND
        );
    }
}
