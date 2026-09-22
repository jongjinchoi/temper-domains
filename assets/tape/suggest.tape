Output assets/screenshots/suggest.gif

Require temper
Require temper-media-session

Set Shell "zsh"
Set FontFamily "Andale Mono"
Set FontSize 18
Set Width 1200
Set Height 700
Set Padding 20
Set Framerate 15
Set TypingSpeed 45ms
Set CursorBlink false
Set Theme "Catppuccin Mocha"

Type "temper suggest gethalden"
Enter
Wait+Screen@15s /15 names checked/
Wait+Screen /Summary:/
Sleep 1s
Screenshot assets/screenshots/suggest.png
Sleep 3s
Hide
Ctrl+C
