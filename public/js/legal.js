// Privacy notice and terms of use. Plain English, kept short.
const UPDATED = '23 October 2026';
const CONTACT = 'topflight501@outlook.com';

export const privacyHtml = `
  <h2>Privacy</h2>
  <p class="hint">Last updated ${UPDATED}</p>
  <div class="legal">
    <p><b>The short version:</b> Top Flight 501 doesn’t ask for your name, email or any personal details. There are no passwords, no cookies, no adverts and no tracking across other sites. If you join a league, you pick a nickname, and we keep that nickname and your league scores. You can delete them at any time. We count visits anonymously so we know how the game is being used.</p>
    <h3>What stays on your device</h3>
    <p>To make the game work, your browser saves a few things on your own phone or computer: your settings (theme, sound, vibration, reminder time), the player names you type, your game setup, your personal bests, a record of games you’ve finished, your Daily Match results, achievements and which matches you’ve already been shown (so they don’t repeat). This is stored using your browser’s local storage. It never leaves your device and we can’t see it.</p>
    <p>If you set a Daily Match reminder, it’s added straight to your own calendar app. We don’t receive your details or any calendar information.</p>
    <p>You can delete it at any time with <b>Settings → Delete all my data</b>, or by clearing your browser’s site data. If you make a backup file, that file stays with you.</p>
    <p>If you challenge a mate, the link you send contains the game, your score, your name or nickname (if any) and the list of matches you played. It goes only to whoever you send it to. If you have a leagues nickname, the link also carries a short challenge code, and the results are saved as described below.</p>
    <h3>Nicknames and leagues (optional)</h3>
    <p>Leagues are optional. If you pick a nickname, we store on our server:</p>
    <ul>
      <li>your nickname and the club colours you choose</li>
      <li>your Daily Match scores (your first go each day)</li>
      <li>the leagues you’re in</li>
      <li>the results of challenge links played between players with nicknames</li>
      <li>a scrambled (hashed) copy of your recovery code, so we can recognise your phone. We can’t turn it back into the code.</li>
    </ul>
    <p>We don’t ask for your real name, email, age or location, and you shouldn’t use your real name as a nickname. Other players in your leagues can see your nickname, colours, scores and results.</p>
    <p><b>Why:</b> to run the leagues and challenges you’ve chosen to take part in. <b>How long:</b> until you delete it. A nickname that isn’t used for 12 months is deleted automatically, with everything linked to it.</p>
    <p><b>Deleting it:</b> Leagues → your nickname → <b>Edit</b> → <b>Delete my nickname</b>, or <b>Settings → Delete all my data</b>. Everything linked to your nickname is removed from our server straight away.</p>
    <p>If you report a name, we keep the report until we’ve dealt with it. League data is stored by Cloudflare in the European Union.</p>
    <h3>Anonymous visit counting</h3>
    <p>We use Umami (umami.is), a privacy-focused, cookie-free analytics service, to count visits and see which games are played. It records things like the page visited, the game started or finished, the type of device and browser, the country and region the visit came from, and the website that sent you here. It doesn’t use cookies, doesn’t store your IP address, doesn’t build a profile of you and can’t identify you. We only ever see totals, for example “300 games of Killer this week”.</p>
    <p>If your browser has “Do Not Track” switched on, you aren’t counted at all. Our reason for counting is our legitimate interest in understanding how the game is used so we can improve it.</p>
    <h3>Hosting</h3>
    <p>The site is hosted by Cloudflare (cloudflare.com). Like any web host, Cloudflare’s servers handle technical information such as your IP address and browser type to deliver the pages and keep the service secure. We don’t use this information to identify you.</p>
    <h3>Fonts and images</h3>
    <p>All fonts and images are served from this site. Apart from the anonymous visit counter above, nothing is loaded from Google or other third parties while you play.</p>
    <h3>Links to other sites</h3>
    <p>Links to X, Instagram, TikTok and Buy Me a Coffee take you to those services, which have their own privacy policies.</p>
    <h3>Daily Match leaderboard</h3>
    <p>When you finish the Daily Match, your score is added to anonymous daily totals so we can show today’s top score and how you compare. Our host, Cloudflare, tells us which country the score came from. We keep only the score, the day and the country: no names, IP addresses or device IDs.</p>
    <h3>Contacting us</h3>
    <p>If you email us at <b>${CONTACT}</b> (for example to report a match), we use your email only to reply and don’t share it.</p>
    <h3>Your rights</h3>
    <p>If you have a nickname, you can see and delete everything linked to it in the game at any time. Because a nickname isn’t tied to your name or email, if you contact us about it we’ll need your recovery code to find it. Visit counts are anonymous totals and can’t be traced back to you. If you have a question, email <b>${CONTACT}</b>. You also have the right to complain to the Data Protection Commission in Ireland (dataprotection.ie).</p>
    <h3>Changes</h3>
    <p>If we change what we collect, we’ll update this notice first and change the date at the top.</p>
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
    <p>Match details come from publicly available records, including Fantasy Premier League data and Wikipedia’s list of Premier League managers. We check them carefully, but mistakes are possible. If you spot one, tap “Report this match” on that match’s answers (“👀 Last match’s answers” after a match, or after giving up).</p>
    <h3>Fair use</h3>
    <p>Please don’t try to disrupt the site, copy it wholesale or use it for anything unlawful.</p>
    <h3>No guarantees</h3>
    <p>The game is provided as it is, without warranties. We may change, pause or stop it at any time. Your settings, personal bests, achievements and Daily Match scores are saved only on your device (apart from your leagues nickname and league scores), so use Settings → Backup if they matter to you.</p>
    <h3>Nicknames</h3>
    <p>Pick a nickname that isn’t rude, hurtful or pretending to be someone else, and isn’t your real name. We may change or remove any nickname or league name, without warning.</p>
    <h3>Liability</h3>
    <p>To the extent the law allows, we aren’t responsible for any loss arising from using the site. Nothing in these terms limits rights you have under Irish or EU consumer law.</p>
    <h3>Contact</h3>
    <p>Questions? Email <b>${CONTACT}</b>.</p>
    <p class="hint">Font: Outfit, used under the SIL Open Font License.</p>
  </div>
  <button class="btn primary big" data-act="close">Close</button>`;
