Output assets/screenshots/theme-rose-pine-dawn.gif

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
Set Theme { "name": "Dawn", "background": "#faf4ed", "foreground": "#333333", "black": "#464261", "red": "#b4637a", "green": "#286983", "yellow": "#ea9d34", "blue": "#56949f", "magenta": "#907aa9", "cyan": "#56949f", "white": "#faf4ed", "brightBlack": "#797593", "brightRed": "#b4637a", "brightGreen": "#286983", "brightYellow": "#ea9d34", "brightBlue": "#56949f", "brightMagenta": "#907aa9", "brightCyan": "#56949f", "brightWhite": "#faf4ed", "selection": "#f4ede8", "cursor": "#464261" }

Hide
Type "temper config theme rose-pine-dawn"
Enter
Wait+Screen /Theme set to: rose-pine-dawn/
Wait+Line /^>\s*$/
Type "temper search gethalden"
Enter
Wait+Screen@15s /Search complete.*30.30 answered/
Wait+Screen /Confirm purchase availability and pricing with a registrar/
Show
Sleep 1s
Screenshot assets/screenshots/theme-rose-pine-dawn.png
Sleep 3s
Hide
Ctrl+C
