# Video Player

A video player that runs entirely in your browser, on desktop and mobile. No frameworks, no build step, no dependencies: just HTML, CSS and JavaScript.

**Live demo:** https://duxkzy.github.io/VideoPlayer/

> The interface is in Spanish.

## Features

- Open one or many videos, or drag and drop them onto the page
- Playlist with previous / next, auto-advance and remove
- Skip ±10 s: double tap on the sides of the video (phone) or the buttons / `J` `L` keys
- Playback speed fro
- Subtitles: load `.srt` or `.vtt` files (UTF-8 or Windows-1252), matched by file name when dropped together with the video
- Remembers where you left each video, and your volume
- Picture-in-picture and fullscreen
- Time preview bubble on the progress bar
- Installable as an app (PWA) and works offline
- Touch-friendly layout that adapts to phones, tablets and small windows

## Privacy

Your videos never leave your device. The browser reads the files straight from your disk, and only small preferences (volume, last position of each video) are saved in `localStorage`.

## Run it

The quickest way is to open `index.html` in your browser.
                                                                  To try it from your ed server (Node.js,no dependencies) and open the address it prints. Phone and computer need to be on the same WiFi:                                      
```bash
node server.js
```

Installing it as an app needs HTTPS, so use the live demo (or any HTTPS host) for that

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `Space` / `K` | Play / pause |
| `J` / `L` | −10 s / +10 s |
| `←` / `→` | −5 s / +5 s |
| `0`–`9` | Jump to 0 %–90 % |
| `↑` / `↓` | Volume |
| `M` | Mute |
| `<` / `>` | Playback speed |
| `C` | Subtitles on / off |
| `I` | Picture-in-picture |
| `F` | Fullscreen |
| `Shift` + `N` / `P` | Next / previous video |

## Project structure

```
index.html            page markup and icons
styles.css            all the styles
app.js                all the logic
sw.js                 service worker (offline support)
manifest.webmanifest  PWA manifest
icons/                app icons
server.js             tiny local server for testing on a phone
```

## Browser support

Works in current Chrome, Edge, Firefox and Safari. Which video formats play depends on your browser: MP4 (H.264) and WebM work almost everywhere, while MKV or AVI may not. On iPhone, fullscreen uses Apple's own player.

## License

MIT
