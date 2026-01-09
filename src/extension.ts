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
import * as Dialog from 'resource:///org/gnome/shell/ui/dialog.js';
import { ModalDialog } from 'resource:///org/gnome/shell/ui/modalDialog.js';
import { PopupMenuItem } from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as QuickSettings from 'resource:///org/gnome/shell/ui/quickSettings.js';
import * as SystemActions from 'resource:///org/gnome/shell/misc/systemActions.js';
import {
  Extension,
  gettext as _,
} from 'resource:///org/gnome/shell/extensions/extension.js';

// www.freedesktop.org/software/systemd/man/latest/org.freedesktop.login1.html
const loginManagerInterface: string = `<node>
  <interface name="org.freedesktop.login1.Manager">
    <property name="BootLoaderEntries" type="as" access="read"/>
    <method name="CanRebootToFirmwareSetup">
      <arg type="s" direction="out" name="result"/>
    </method>
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
interface LoginManager extends Gio.DBusProxy {
  BootLoaderEntries: string[];
  CanRebootToFirmwareSetupSync(): 'yes' | 'challenge' | 'no' | 'na';
  SetRebootToFirmwareSetupSync(enable: boolean): void;
  SetRebootToBootLoaderEntrySync(bootLoaderEntry: string): void;
  RebootSync(interactive: boolean): void;
}
const LoginManagerProxy = Gio.DBusProxy.makeProxyWrapper(loginManagerInterface);

export default class ExtraRebootOptionsExtension extends Extension {
  private loginManager: LoginManager | undefined;
  private rebootOptions: Dialog.ButtonInfo[] = [];
  private menuItem: PopupMenuItem | undefined;
  private sourceId: number | null = null;

  constructor(metadata: any) {
    super(metadata);
  }

  enable(): void {
    this.loginManager = LoginManagerProxy(
      Gio.DBus.system,
      'org.freedesktop.login1',
      '/org/freedesktop/login1',
    ) as LoginManager;

    if (this.loginManager.CanRebootToFirmwareSetupSync() == 'yes') {
      this.rebootOptions.push({
        label: _('UEFI Firmware'),
        action: () => {
          this.reboot((cancel: boolean) => {
            this.loginManager?.SetRebootToFirmwareSetupSync(!cancel);
          });
        },
      });
    }

    this.loginManager.BootLoaderEntries.forEach((entry: string) => {
      this.rebootOptions.push({
        label: entry,
        action: () => {
          this.reboot((cancel: boolean) => {
            this.loginManager?.SetRebootToBootLoaderEntrySync(
              cancel ? '' : entry,
            );
          });
        },
      });
    });

    if (this.rebootOptions.length == 0) {
      console.warn(
        'No available bootloader entries; disabling extra-reboot-options...',
      );
      return;
    }

    this.whenQuickSettingsReady(() => {
      let menu = (
        panel.statusArea.quickSettings._system as QuickSettings.SystemIndicator
      ).quickSettingsItems[0].menu;
      this.menuItem = new PopupMenuItem(_('More...'));
      this.menuItem.connect('activate', () => this.showRebootOptionsDialog());
      menu.addMenuItem(this.menuItem, 3);
    });
  }

  disable(): void {
    if (this.menuItem) {
      this.menuItem.destroy();
      this.menuItem = undefined;
    }
    if (this.sourceId) {
      GLib.Source.remove(this.sourceId);
      this.sourceId = null;
    }
    this.rebootOptions = [];
    this.loginManager = undefined;
  }

  private whenQuickSettingsReady(action: () => void): void {
    if (panel.statusArea.quickSettings._system) {
      action();
      return;
    }

    this.sourceId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
      if (panel.statusArea.quickSettings._system) {
        action();
        return GLib.SOURCE_REMOVE;
      } else {
        return GLib.SOURCE_CONTINUE;
      }
    });
  }

  private reboot(prepareReboot: (cancel: boolean) => void): void {
    try {
      // Ideally we would wait for the reboot signal and then apply reboot options,
      // but currently its easier to just apply them now and revert if the reboot
      // is cancelled/fails.
      prepareReboot(false);
      // Gjs types are incomplete here but SystemActions.ActivateReboot() consumes errors anyway,
      // so we need to use the underlying DBus message to get the request result.
      (SystemActions.getDefault() as any)._session
        .RebootAsync()
        .catch(() => prepareReboot(true));
    } catch {
      prepareReboot(true);
    }
  }

  private showRebootOptionsDialog(): void {
    const dialog = new ModalDialog({
      styleClass: 'modal-dialog',
    });

    // Message Header:
    {
      let headerBox = new St.BoxLayout({
        xAlign: Clutter.ActorAlign.CENTER,
        yExpand: true,
        vertical: true,
      });

      const titleBox = new St.BoxLayout({
        xAlign: Clutter.ActorAlign.CENTER,
      });
      titleBox.add_child(new St.Label({ text: '  ' }));
      const dialogTitle = new St.Label({
        text: _('Restart'),
        style: 'font-weight: bold;font-size:18px',
      });
      titleBox.add_child(dialogTitle);

      headerBox.add_child(titleBox);
      headerBox.add_child(new St.Label({ text: '  ' }));

      let dialogMessage = new St.Label({
        text: _('Select a boot-loader entry for next restart.'),
      });
      dialogMessage.clutterText.ellipsize = Pango.EllipsizeMode.NONE;
      dialogMessage.clutterText.lineWrap = true;

      headerBox.add_child(dialogMessage);

      dialog.contentLayout.add_child(headerBox);
    }
    // Reboot Options (same implementation as ModalDialog.setButtons(), but in a vertical scrollview):
    {
      let optionsContainer = new St.ScrollView({
        styleClass: 'dialog-list-scrollview',
        hscrollbarPolicy: St.PolicyType.NEVER,
        vscrollbarPolicy: St.PolicyType.AUTOMATIC,
      });
      let optionsLayout = new St.BoxLayout({
        styleClass: 'modal-dialog-button-box',
        style: 'spacing: 1em',
        xAlign: Clutter.ActorAlign.CENTER,
        vertical: true,
      });
      this.rebootOptions.forEach(option => {
        let button = new St.Button({
          styleClass: 'modal-dialog-button',
          buttonMask: St.ButtonMask.ONE | St.ButtonMask.THREE,
          reactive: true,
          canFocus: true,
          xExpand: true,
          yExpand: true,
          label: option.label,
        });
        button.connect('clicked', () => {
          dialog.close();
          option.action();
        });
        optionsLayout.add_child(button);
      });
      optionsContainer.set_child(optionsLayout);
      dialog.contentLayout.add_child(optionsContainer);
    }
    // Separator (borrowed from quick settings):
    {
      let separator = new St.Bin({
        styleClass: 'popup-separator-menu-item',
        xExpand: true,
      });
      separator.set_child(
        new St.Widget({
          styleClass: 'popup-separator-menu-item-separator',
          xExpand: true,
          yExpand: true,
          yAlign: Clutter.ActorAlign.CENTER,
        }),
      );
      dialog.contentLayout.add_child(separator);
    }

    dialog.addButton({
      label: _('Cancel'),
      action: () => dialog.close(),
      default: true,
      key: Clutter.KEY_Escape,
    });

    dialog.open();
  }
}
