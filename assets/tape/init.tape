Output assets/screenshots/init.gif

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

Type "temper init"
Enter
Wait+Screen /Step 1 of 3/
Wait+Screen /Select your preferred registrar/
Sleep 1s
Screenshot assets/screenshots/init.png
Sleep 3s
Hide
Ctrl+C
