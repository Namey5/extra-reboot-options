# Extra Reboot Options

[![extensions.gnome.org](https://img.shields.io/badge/dynamic/regex?url=https%3A%2F%2Fextensions.gnome.org%2Fextension%2F9135%2Fextra-reboot-options%2F&search=(%5Cd%2B)%20downloads&logo=gnome&label=extensions.gnome.org)](https://extensions.gnome.org/extension/9135/extra-reboot-options/)

This is a GNOME shell extension to show all [`systemd`-supported bootloader entries](https://www.freedesktop.org/software/systemd/man/latest/systemctl.html#--boot-loader-entry=ID) (UEFI firmware, Windows dual-boot, etc.) when right-clicking (or shift-clicking) the `Restart...` button in the quick-settings power menu.

> [!IMPORTANT]
> The `systemd` bootloader interface is [only supported on EFI systems](https://systemd.io/BOOT_LOADER_INTERFACE/).
> If the right-click icon does not show up on the `Restart...` button, your bootloader may not be supported by `systemctl reboot`.
> 
> This has been tested with `systemd-boot` on [EndeavourOS](https://endeavouros.com/) running GNOME 49.

<p align="center">
  <img width="427" height="671" alt="Altered restart button in power menu" src="https://github.com/user-attachments/assets/7fdd22e6-e972-4f08-8342-d915c7e53041" />
  <img width="476" height="425" alt="Popup with multiple reboot options" src="https://github.com/user-attachments/assets/59299398-ab49-47a2-a953-7f58f925b14a" />
</p>

> [!NOTE]
> This extension was originally forked from [UbayGD/RebootToUEFI](https://github.com/UbayGD/reboottouefi).

## Installation
Fetch a build of `extra-reboot-options@namey5.zip` from [Releases](https://github.com/Namey5/extra-reboot-options/releases) and extract it to:
```
~/.local/share/gnome-shell/extensions
```
Then enable `Extra Reboot Options` from https://extensions.gnome.org/local/ or the [Extensions](https://apps.gnome.org/Extensions/) app (might require a desktop session restart).

## Requirements

| Dependency | Tested Version |
| ----- | ----- |
| GNU Make | 4.4.1 |
| NodeJS + npm | 11.7.0 |
| gettext | 0.26 |
| gnome-extensions | 49.2 |

## Building
To build the extension run the following command:
```bash
make pack
```
If all goes well this will generate a zip file in the `./out` folder.

To install the extension just run the following command:
```bash
make install
```
