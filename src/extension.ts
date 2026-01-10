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
import { dgettext } from 'gettext';
import { panel } from 'resource:///org/gnome/shell/ui/main.js';
import * as Dialog from 'resource:///org/gnome/shell/ui/dialog.js';
import { ModalDialog } from 'resource:///org/gnome/shell/ui/modalDialog.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as QuickSettings from 'resource:///org/gnome/shell/ui/quickSettings.js';
import * as SystemActions from 'resource:///org/gnome/shell/misc/systemActions.js';
import {
  Extension,
  gettext as _,
} from 'resource:///org/gnome/shell/extensions/extension.js';

// Wrapper for gettext in the shell's default domain - this will prevent our .pot from getting updated.
const shellText = (text: string) => dgettext(null, text);

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
  private restartGesture: Clutter.ClickGesture | null = null;
  private gestureHandlerId: number | null = null;
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

    let supportsUefiReboot =
      this.loginManager.CanRebootToFirmwareSetupSync() == 'yes';
    if (supportsUefiReboot) {
      this.rebootOptions.push({
        label: _('UEFI Firmware'),
        action: () => {
          this.reboot((cancel: boolean) => {
            this.loginManager?.SetRebootToFirmwareSetupSync(!cancel);
          });
        },
      });
    }

    for (let entry of this.loginManager.BootLoaderEntries) {
      let label = entry;
      // Filter known bootloader entries.
      // https://systemd.io/BOOT_LOADER_INTERFACE/#boot-loader-entry-identifiers
      const knownBootloaderEntries: [RegExp, string][] = [
        [/(?:auto-)?windows-?(.*)/g, _('Windows %s')],
        [/(?:auto-)?osx-?(.*)/g, _('OSX %s')],
        [/(?:auto-)?efi-shell/g, _('EFI Shell')],
        [/(?:auto-)?reboot-to-firmware-setup/g, _('UEFI Firmware')],
      ];
      for (let [pattern, name] of knownBootloaderEntries) {
        let regex = pattern.exec(entry);
        if (regex) {
          label = regex.length > 1 ? name.format(regex[1] ?? '') : name;
          break;
        }
      }
      label = label.trim();
      // Ignore firmware entry if we have already handled it.
      if (supportsUefiReboot && label === this.rebootOptions[0].label) {
        continue;
      }

      this.rebootOptions.push({
        label,
        action: () => {
          this.reboot((cancel: boolean) => {
            this.loginManager?.SetRebootToBootLoaderEntrySync(
              cancel ? '' : entry,
            );
          });
        },
      });
    }

    this.getPowerSettingsMenu(powerMenu => {
      let menuItems = powerMenu._getMenuItems();
      // Find the restart button's click gesture by looking up its label.
      // This will already be translated, so need to use the shell's gettext domain.
      let restartLabel = shellText('Restart…');
      this.restartGesture = (
        menuItems.find(base => {
          let item = base as PopupMenu.PopupMenuItem;
          return item?.label?.text === restartLabel;
        }) as any
      )?._clickGesture;
      // Hijack the click handler and inject our own custom reboot if the modifiers are met.
      this.gestureHandlerId =
        this.restartGesture?.connect('should-handle-sequence', (_, event) => {
          if (
            event.has_shift_modifier() ||
            event.get_button() === Clutter.BUTTON_SECONDARY
          ) {
            this.showRebootOptionsDialog();
            return false;
          }
          return true;
        }) ?? null;
    });
  }

  disable(): void {
    if (this.gestureHandlerId) {
      this.restartGesture?.disconnect(this.gestureHandlerId);
    }
    this.gestureHandlerId = null;
    this.restartGesture = null;
    if (this.sourceId) {
      GLib.Source.remove(this.sourceId);
    }
    this.sourceId = null;
    this.rebootOptions = [];
    this.loginManager = undefined;
  }

  private getPowerSettingsMenu(
    action: (powerMenu: QuickSettings.QuickToggleMenu) => void,
  ): void {
    let getMenu = () => {
      if (panel.statusArea.quickSettings._system) {
        action(
          panel.statusArea.quickSettings._system.quickSettingsItems[0].menu,
        );
        return true;
      }
      return false;
    };

    if (!getMenu()) {
      this.sourceId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
        return getMenu() ? GLib.SOURCE_REMOVE : GLib.SOURCE_CONTINUE;
      });
    }
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
        styleClass: 'message-dialog-content',
        xAlign: Clutter.ActorAlign.CENTER,
        yExpand: true,
        vertical: true,
      });

      const dialogTitle = new St.Label({
        styleClass: 'message-dialog-title',
        text: _('Restart'),
      });
      headerBox.add_child(dialogTitle);

      let dialogMessage = new St.Label({
        styleClass: 'message-dialog-description',
        text:
          this.rebootOptions.length > 0
            ? _('Select a boot-loader entry for next restart.')
            : _('No supported boot-loader entries found.'),
      });
      dialogMessage.clutterText.ellipsize = Pango.EllipsizeMode.NONE;
      dialogMessage.clutterText.lineWrap = true;
      headerBox.add_child(dialogMessage);

      dialog.contentLayout.add_child(headerBox);
    }
    // Reboot Options (same implementation as ModalDialog.setButtons(), but in a vertical scrollview):
    if (this.rebootOptions.length > 0) {
      let container = new St.Bin({ styleClass: 'dialog-list' });

      let optionsContainer = new St.ScrollView({
        styleClass: 'dialog-list-scrollview',
        hscrollbarPolicy: St.PolicyType.NEVER,
        vscrollbarPolicy: St.PolicyType.AUTOMATIC,
      });
      optionsContainer.add_effect(new St.ScrollViewFade({}));

      let optionsLayout = new St.BoxLayout({
        styleClass: 'modal-dialog-button-box',
        style: 'spacing: 1em',
        xAlign: Clutter.ActorAlign.CENTER,
        vertical: true,
      });
      for (let option of this.rebootOptions) {
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
      }
      optionsContainer.set_child(optionsLayout);

      container.set_child(optionsContainer);
      dialog.contentLayout.add_child(container);

      // Separator (borrowed from quick settings):
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
