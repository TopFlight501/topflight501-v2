// Privacy notice and terms of use. Plain English, kept short.
const UPDATED = '1 October 2026';
const CONTACT = 'topflight501@outlook.com';

export const privacyHtml = `
  <h2>Privacy</h2>
  <p class="hint">Last updated ${UPDATED}</p>
  <div class="legal">
    <p><b>The short version:</b> Top Flight 501 doesn’t ask for, collect or store your personal information. There are no accounts, no cookies, no adverts and no tracking across other sites. We count visits anonymously so we know how the game is being used.</p>
    <h3>What stays on your device</h3>
    <p>To make the game work, your browser saves a few things on your own phone or computer: your settings (theme, sound, vibration, reminder time), the player names you type, your game setup, your personal bests, a record of games you’ve finished, your Daily Match results and which matches you’ve already been shown (so they don’t repeat). This is stored using your browser’s local storage. It never leaves your device and we can’t see it.</p>
    <p>If you set a Daily Match reminder, it’s added straight to your own calendar app. We don’t receive your details or any calendar information.</p>
    <p>You can delete it at any time with <b>Settings → Delete all my data</b>, or by clearing your browser’s site data. If you make a backup file, that file stays with you.</p>
    <h3>Anonymous visit counting</h3>
    <p>We use Umami (umami.is), a privacy-focused, cookie-free analytics service, to count visits and see which games are played. It records things like the page visited, the game started or finished, the type of device and browser, the country and region the visit came from, and the website that sent you here. It doesn’t use cookies, doesn’t store your IP address, doesn’t build a profile of you and can’t identify you. We only ever see totals, for example “300 games of Killer this week”.</p>
    <p>If your browser has “Do Not Track” switched on, you aren’t counted at all. Our reason for counting is our legitimate interest in understanding how the game is used so we can improve it.</p>
    <h3>Hosting</h3>
    <p>The site is hosted by Render (render.com). Like any web host, Render’s servers handle technical information such as your IP address and browser type to deliver the pages and keep the service secure. We don’t use this information to identify you.</p>
    <h3>Fonts and images</h3>
    <p>All fonts and images are served from this site. Apart from the anonymous visit counter above, nothing is loaded from Google or other third parties while you play.</p>
    <h3>Links to other sites</h3>
    <p>Links to X, Instagram and Buy Me a Coffee take you to those services, which have their own privacy policies.</p>
    <h3>Contacting us</h3>
    <p>If you email us at <b>${CONTACT}</b> (for example to report a match), we use your email only to reply and don’t share it.</p>
    <h3>Your rights</h3>
    <p>Because we don’t hold personal data about you, there’s normally nothing for us to access or delete. Visit counts are anonymous totals and can’t be traced back to you. If you have a question, email <b>${CONTACT}</b>. You also have the right to complain to the Data Protection Commission in Ireland (dataprotection.ie).</p>
    <h3>Changes</h3>
    <p>If we ever add accounts or anything that collects personal data, we’ll update this notice and ask before anything is collected.</p>
  </div>
  <button class="btn primary big" data-act="close">Close</button>`;

export const termsHtml = `
  <h2>Terms of use</h2>
  <p class="hint">Last updated ${UPDATED}</p>
  <div class="legal">
    <p>Top Flight 501 is a free fan-made trivia game, provided for fun. By using it you agree to these terms.</p>
    <h3>Not official</h3>
    <p>Top Flight 501 is not affiliated with, endorsed by or connected to the Premier League, Fantasy Premier League or any football club. Club and competition names are used only to describe real matches.</p>
    <h3>Match data</h3>
    <p>Match details come from publicly available records, including Fantasy Premier League data and Wikipedia’s list of Premier League managers. We check them carefully, but mistakes are possible. If you spot one, use “Report this match” in the answer key.</p>
    <h3>Fair use</h3>
    <p>Please don’t try to disrupt the site, copy it wholesale or use it for anything unlawful.</p>
    <h3>No guarantees</h3>
    <p>The game is provided as it is, without warranties. We may change, pause or stop it at any time. Your settings and personal bests are saved on your device, so keep a backup if they matter to you.</p>
    <h3>Liability</h3>
    <p>To the extent the law allows, we aren’t responsible for any loss arising from using the site. Nothing in these terms limits rights you have under Irish or EU consumer law.</p>
    <h3>Contact</h3>
    <p>Questions? Email <b>${CONTACT}</b>.</p>
    <p class="hint">Font: Outfit, used under the SIL Open Font License.</p>
  </div>
  <button class="btn primary big" data-act="close">Close</button>`;
