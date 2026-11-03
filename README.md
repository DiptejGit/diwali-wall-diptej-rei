# Diwali Lantern Wall

Employees scan a QR code, type their name, and a lantern lights up on the lobby screen.
No sign-in, no accounts. Zero dependencies (just Node 16 or newer).

## Run it

    node server.js

- Phones open:   http://<server-address>:3000/
- Lobby screen:  http://<server-address>:3000/#wall   (open full screen on the TV)
- The organizer key is printed when the server starts. Set your own with:
      ADMIN_KEY=mysecret node server.js

## Quick options to get a public address

1. Same office Wi-Fi: run on any laptop or PC and use its local IP, e.g. http://192.168.1.20:3000
   (phones must be on the same network).
2. Quick public link for the day: run the server, then `cloudflared tunnel --url http://localhost:3000`
   (or ngrok) and use the https address it prints.
3. Always-on hosting: deploy this folder to Render, Railway, Fly.io or any VPS.
   Start command: `node server.js`. It reads the PORT environment variable.
   Set DATA_FILE to a path on a persistent disk if you want diyas to survive restarts.

## Organizer controls (on the wall page)

Click "Organizer", enter the key, then:
- Settings: company name, finale target (default 100), QR link.
- Hover a diya and click x to remove it.
- "Celebrate now" starts the fireworks finale on every wall screen.

The QR code on the wall automatically points to the address the wall was opened from.
If employees reach the site by a different address, set it under Settings.

## What employees see
- They choose one of six characters (Lehenga, Saree, Anarkali, Kurta, Sherwani, Dhoti). The character
  arrives, dances and lights crackers on their phone while their lantern is lit.
- They can create a shareable Diwali card (PNG with their selfie lantern, name, wish and company logo)
  and share it to WhatsApp or LinkedIn, or download it.
- On the lobby wall, each new lantern gets a short welcome dance and a bell chime (if sound is on),
  and wishes are shown on a big lantern.

## The wall scene
Night sky with twinkling stars, a marigold garland across the top, lanterns hanging from garlands,
a row of lit diyas along the bottom, and a rangoli underneath that fills up as lanterns are lit.

## Wish lantern
- The big lantern on the right is a glowing 3D lantern that gently swings, with light rays and floating embers.
  It takes the colour of whoever's wish it is showing and flares each time a new wish appears.

## Grand finale
When the target is reached (or the organizer starts it): all lanterns float up into the night sky, then fly together
into a giant lantern made from everyone's selfies, followed by a Thank you screen with fireworks.
The giant lantern is divided into exactly one tile per person: one person gets the whole lantern, two people get
half each, and so on, with tiles getting smaller as more people join. Faces are never repeated.

## Organizer controls (on the wall page)

Click "Organizer", enter the key, then:
- Settings: company name, finale target (default 100), QR link.
- Hover a diya and click x to remove it.
- "Celebrate now" starts the fireworks finale on every wall screen.

The QR code on the wall automatically points to the address the wall was opened from.
If employees reach the site by a different address, set it under Settings.

## What employees see
- They choose one of six characters (Lehenga, Saree, Anarkali, Kurta, Sherwani, Dhoti). The character
  arrives, dances and lights crackers on their phone while their lantern is lit.
- They can create a shareable Diwali card (PNG with their selfie lantern, name, wish and company logo)
  and share it to WhatsApp or LinkedIn, or download it.
- On the lobby wall, each new lantern gets a short welcome dance and a bell chime (if sound is on),
  and wishes are shown on a big lantern.

## The wall scene
Night sky with twinkling stars, a marigold garland across the top, lanterns hanging from garlands,
a row of lit diyas along the bottom, and a rangoli underneath that fills up as lanterns are lit.

## Wish lantern
- The big lantern on the right is a glowing 3D lantern that gently swings, with light rays and floating embers.
  It takes the colour of whoever's wish it is showing and flares each time a new wish appears.

## Grand finale
When the target is reached (or the organizer starts it): all lanterns float up into the night sky,
then fly together into a giant lantern made from everyone's selfies, followed by a Thank you screen.

## Organizer controls
Move the mouse (or tap the screen) on the wall to reveal the controls at the bottom right:
Sound on/off (click once so the browser allows audio), Full screen, and Organizer/Settings.
In Settings you can set the company name, upload a company logo, set the finale target, and start the finale.

## Selfies
- Employees can take an optional selfie on their phone (front camera). It is cropped to a small square
  and shown inside their lantern on the wall, on the wish lantern, and on their own phone.
- Photos are stored on the server (in data.json) until you delete that file or remove the lantern with the x button.
  Tell employees their selfie will be displayed on the lobby screen, and let them skip it.
- Removing a lantern as the organizer also deletes its photo.

## Permanent storage (so nothing is lost when the server restarts)
By default, lanterns are saved in a local file. On free hosting such as Render that file is erased whenever the
service restarts or sleeps. To keep everything (lanterns, selfies, settings, logo) permanently, connect a free
Upstash Redis database:

1. Create a free account at upstash.com, then "Create Database" (type: Redis, plan: Free, pick a nearby region).
2. Open the database and find the "REST API" section. Copy `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
3. In Render, open your service, go to Environment, add both variables with those values, and save.
   Render redeploys by itself.
4. Check it: open `https://YOUR-SITE/healthz`. It should show `"storage":"redis"` and `"ready":true`.
   In the wall, open Settings: it should say "Storage: permanent".

Keep the token private (never put it in the web page or on GitHub). Your organizer key is also saved there.

Privacy: lanterns and selfies now stay until you delete them. After the event, open the wall, then Settings, then
"Delete all lanterns and selfies".

## Notes
- One lantern per device (remembered in the browser). Editing updates the same diya.
- Names, team and wish are length-limited and stripped of markup. Basic rate limiting is built in.
- Without Upstash, data is stored in data.json next to server.js (temporary on free hosting).
