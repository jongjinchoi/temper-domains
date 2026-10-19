Output assets/screenshots/watchlist.gif

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

Type "temper watch gethalden.dev"
Enter
Wait+Screen /Added gethalden.dev to watchlist/
Type "temper watch gethalden.com"
Enter
Wait+Screen /Added gethalden.com to watchlist/
Type "temper list"
Enter
Wait+Screen@15s /gethalden.dev.*available/
Wait+Screen /gethalden.com.*taken/
Sleep 1s
Screenshot assets/screenshots/watchlist.png
Sleep 3s
Hide
Ctrl+C
