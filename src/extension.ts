/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-3.0-only
 */

/* exported init */

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import Pango from 'gi://Pango';
import { panel } from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';
import {
  Extension,
  gettext as _,
} from 'resource:///org/gnome/shell/extensions/extension.js';

const ManagerInterface: string = `<node>
  <interface name="org.freedesktop.login1.Manager">
    <method name="SetRebootToFirmwareSetup">
      <arg type="b" direction="in" name="enable"/>
    </method>
    <method name="SetRebootToBootLoaderEntry">
      <arg type="s" direction="in" name="boot_loader_entry"/>
    </method>
    <method name="Reboot">
      <arg type="b" direction="in" name="interactive"/>
    </method>
  </interface>
</node>`;
const Manager = Gio.DBusProxy.makeProxyWrapper(ManagerInterface);

export default class ExtraRebootOptionsExtension extends Extension {
  private menu: any;
  private proxy!: any | null;
  private rebootToUefiItem!: PopupMenu.PopupMenuItem | null;
  private rebootToWindowsItem!: PopupMenu.PopupMenuItem | null;
  private counter!: number;
  private seconds!: number;
  private counterIntervalId!: GLib.Source;
  private messageIntervalId!: GLib.Source;
  private sourceId!: number | null;

  constructor(metadata: any) {
    super(metadata);
  }

  private modifySystemItem(): void {
    this.menu =
      panel.statusArea.quickSettings._system?.quickSettingsItems[0].menu;

    this.proxy = Manager(
      Gio.DBus.system,
      'org.freedesktop.login1',
      '/org/freedesktop/login1',
    );

    this.rebootToUefiItem = this.addMenuItem(_('Restart to UEFI'), 2, () => {
      this.rebootToUefi();
    });
    this.rebootToWindowsItem = this.addMenuItem(
      _('Restart to Windows'),
      3,
      () => {
        this.rebootToWindows();
      },
    );
  }

  private queueModifySystemItem(): void {
    this.sourceId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
      if (!panel.statusArea.quickSettings._system) return GLib.SOURCE_CONTINUE;

      this.modifySystemItem();
      return GLib.SOURCE_REMOVE;
    });
  }

  enable() {
    if (!panel.statusArea.quickSettings._system) {
      this.queueModifySystemItem();
    } else {
      this.modifySystemItem();
    }
  }

  disable() {
    this.clearIntervals();
    this.rebootToUefiItem?.destroy();
    this.rebootToUefiItem = null;
    this.rebootToWindowsItem?.destroy();
    this.rebootToWindowsItem = null;
    this.proxy = null;
    if (this.sourceId) {
      GLib.Source.remove(this.sourceId);
      this.sourceId = null;
    }
  }

  private rebootToUefi(): void {
    this.proxy?.SetRebootToFirmwareSetupRemote(true);
    this.proxy?.RebootRemote(false);
  }

  private rebootToWindows(): void {
    this.proxy?.SetRebootToBootLoaderEntryRemote('auto-windows');
    this.proxy?.RebootRemote(false);
  }

  private addMenuItem(
    name: string,
    order: number,
    reboot: () => void,
  ): PopupMenu.PopupMenuItem {
    let menuItem = new PopupMenu.PopupMenuItem(`${name}...`);
    menuItem.connect('activate', () => {
      this.counter = 60;
      this.seconds = this.counter;

      const dialog = this.buildDialog(name, reboot);
      dialog.open();

      this.counterIntervalId = setInterval(() => {
        if (this.counter > 0) {
          this.counter--;
          if (this.counter % 10 === 0) {
            this.seconds = this.counter;
          }
        } else {
          this.clearIntervals();
          reboot();
        }
      }, 1000);
    });
    this.menu.addMenuItem(menuItem, order);
    return menuItem;
  }

  private buildDialog(
    title: string,
    reboot: () => void,
  ): ModalDialog.ModalDialog {
    const dialog = new ModalDialog.ModalDialog({ styleClass: 'modal-dialog' });
    dialog.setButtons([
      {
        label: _('Cancel'),
        action: () => {
          this.clearIntervals();
          dialog.close();
        },
        key: Clutter.KEY_Escape,
        default: false,
      },
      {
        label: _('Restart'),
        action: () => {
          this.clearIntervals();
          reboot();
        },
        default: false,
      },
    ]);

    const dialogTitle = new St.Label({
      text: title,
      // style_class: 'dialog-title' // TODO investigate why css classes are not working
      style: 'font-weight: bold;font-size:18px',
    });

    let dialogMessage = new St.Label({
      text: this.getDialogMessageText(),
    });
    dialogMessage.clutterText.ellipsize = Pango.EllipsizeMode.NONE;
    dialogMessage.clutterText.lineWrap = true;

    const titleBox = new St.BoxLayout({
      xAlign: Clutter.ActorAlign.CENTER,
    });
    titleBox.add_child(new St.Label({ text: '  ' }));
    titleBox.add_child(dialogTitle);

    let box = new St.BoxLayout({ yExpand: true, vertical: true });
    box.add_child(titleBox);
    box.add_child(new St.Label({ text: '  ' }));
    box.add_child(dialogMessage);

    this.messageIntervalId = setInterval(() => {
      dialogMessage?.set_text(this.getDialogMessageText());
    }, 500);

    dialog.contentLayout.add_child(box);

    return dialog;
  }

  private getDialogMessageText(): string {
    return _(`The system will restart automatically in %d seconds.`).replace(
      '%d',
      String(this.seconds),
    );
  }

  private clearIntervals(): void {
    clearInterval(this.counterIntervalId);
    clearInterval(this.messageIntervalId);
  }
}
