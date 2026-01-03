# Extra Reboot Options
This is a GNOME shell extension to add [all known DBus bootloader entries](https://www.freedesktop.org/software/systemd/man/latest/systemctl.html#--boot-loader-entry=ID) (UEFI firmware, Windows dual-boot, etc.) to the quick-settings power menu.

<img width="411" height="437" alt="Additional option in power menu." src="https://github.com/user-attachments/assets/45141062-bb5f-4f95-9573-e554bd5bc695" />
<img width="463" height="510" alt="Popup with multiple reboot options" src="https://github.com/user-attachments/assets/a5dfe6ee-0e94-4e18-ac19-e7d77596d202" />

> [!NOTE]
> This extension was originally forked from [UbayGD/RebootToUEFI](https://github.com/UbayGD/reboottouefi).

## Installation
Fetch a build of `extra-reboot-options@namey5.com.zip` from [Releases](https://github.com/Namey5/extra-reboot-options/releases) and extract it to:
```
~/.local/share/gnome-shell/extensions
```
Then enable `Extra Reboot Options` from https://extensions.gnome.org/local/ or the [Extensions](https://apps.gnome.org/Extensions/) app (might require a desktop session restart).

> [!IMPORTANT]
> If the `More...` option does not show up in your power menu, your bootloader may not be supported by `systemctl reboot`.

## Building
Requirements:

- make
- nodejs and npm
- gettext

To build the extension run the following command:

`$ make pack`

If all goes well this will generate a zip file in the project folder.

To install the extension just run the following command:

`$ make install`
