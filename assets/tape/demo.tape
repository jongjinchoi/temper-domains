Output assets/screenshots/demo.gif

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
Set Theme "Catppuccin Mocha"

Type "temper search gethalden"
Enter
Wait+Screen@15s /Search complete.*30.30 answered/
Wait+Screen /Confirm purchase availability and pricing with a registrar/
Sleep 2s
Type "/"
Wait+Screen /Filter:/
Type "gethalden.dev"
Enter
Wait+Screen /gethalden.dev.*available/
Enter
Wait+Screen /Selected:.*gethalden.dev/
Wait+Screen /Where to buy/
Sleep 3s
Hide
Ctrl+C
