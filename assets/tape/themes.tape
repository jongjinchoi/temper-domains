Output assets/screenshots/themes.gif

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

Hide
Type "clear"
Enter
Wait+Screen /(?s)^\s*>\s*$/
Type "temper config theme temper-forge"
Enter
Wait+Screen /Theme set to: temper-forge/
Wait+Line /^>\s*$/
Type "temper search gethalden"
Enter
Wait+Screen@15s /Search complete.*30.30 answered/
Wait+Screen /Confirm purchase availability and pricing with a registrar/
Show
Sleep 1s
Screenshot assets/screenshots/theme-temper-forge.png
Sleep 3s
Hide
Type "q"
Wait+Line /^>\s*$/
Hide
Type "clear"
Enter
Wait+Screen /(?s)^\s*>\s*$/
Type "temper config theme seoul-night"
Enter
Wait+Screen /Theme set to: seoul-night/
Wait+Line /^>\s*$/
Type "temper search gethalden"
Enter
Wait+Screen@15s /Search complete.*30.30 answered/
Wait+Screen /Confirm purchase availability and pricing with a registrar/
Show
Sleep 1s
Screenshot assets/screenshots/theme-seoul-night.png
Sleep 3s
Hide
Type "q"
Wait+Line /^>\s*$/
Hide
Type "clear"
Enter
Wait+Screen /(?s)^\s*>\s*$/
Type "temper config theme catppuccin-mocha"
Enter
Wait+Screen /Theme set to: catppuccin-mocha/
Wait+Line /^>\s*$/
Type "temper search gethalden"
Enter
Wait+Screen@15s /Search complete.*30.30 answered/
Wait+Screen /Confirm purchase availability and pricing with a registrar/
Show
Sleep 1s
Screenshot assets/screenshots/theme-catppuccin-mocha.png
Sleep 3s
Hide
Type "q"
Wait+Line /^>\s*$/
Hide
Type "clear"
Enter
Wait+Screen /(?s)^\s*>\s*$/
Type "temper config theme dracula"
Enter
Wait+Screen /Theme set to: dracula/
Wait+Line /^>\s*$/
Type "temper search gethalden"
Enter
Wait+Screen@15s /Search complete.*30.30 answered/
Wait+Screen /Confirm purchase availability and pricing with a registrar/
Show
Sleep 1s
Screenshot assets/screenshots/theme-dracula.png
Sleep 3s
Hide
Type "q"
Wait+Line /^>\s*$/
Hide
Type "clear"
Enter
Wait+Screen /(?s)^\s*>\s*$/
Type "temper config theme default"
Enter
Wait+Screen /Theme set to: default/
Wait+Line /^>\s*$/
Type "temper search gethalden"
Enter
Wait+Screen@15s /Search complete.*30.30 answered/
Wait+Screen /Confirm purchase availability and pricing with a registrar/
Show
Sleep 1s
Screenshot assets/screenshots/theme-default.png
Sleep 3s
Hide
Type "q"
Wait+Line /^>\s*$/
