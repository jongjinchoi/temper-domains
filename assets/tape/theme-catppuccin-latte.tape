Output assets/screenshots/theme-catppuccin-latte.gif

Require temper
Require temper-media-session

Set Shell "zsh"
Set FontFamily "Andale Mono"
Set FontSize 18
Set Width 1200
Set Height 1000
Set Padding 20
Set Framerate 15
Set TypingSpeed 45ms
Set CursorBlink false
Set Theme "Catppuccin Latte"

Hide
Type "temper config theme catppuccin-latte"
Enter
Wait+Screen /Theme set to: catppuccin-latte/
Wait+Line /^>\s*$/
Type "temper search gethalden"
Enter
Wait+Screen@15s /Search complete.*30.30 answered/
Wait+Screen /Confirm purchase availability and pricing with a registrar/
Show
Sleep 1s
Screenshot assets/screenshots/theme-catppuccin-latte.png
Sleep 3s
Hide
Ctrl+C
