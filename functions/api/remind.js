// A calendar reminder for a season league: every Sunday at 7pm until the season ends, "gameweek closes tonight".
// topflight501.com/api/remind?code=TF-K7Q2M  → an .ics file the phone's calendar opens.
import { fail, handle, db, cleanLeague, showLeague, DAILY_START } from '../../lib/server.js';
import { currentGw } from '../../lib/season.js';

const ymd = n => { const d = new Date(DAILY_START + (n - 1) * 864e5); return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`; };
const icsText = s => String(s).replace(/[\\;,]/g, c => '\\' + c).replace(/\n/g, '\\n');

export const onRequestGet = handle(async ({ request, env }) => {
  const DB = await db(env);
  const code = cleanLeague(new URL(request.url).searchParams.get('code'));
  const lg = code && await DB.prepare('SELECT * FROM leagues WHERE code = ?').bind(code).first();
  if (!lg || lg.format === 'open') return fail('No season league has that code.', 404);
  const gws = (await DB.prepare('SELECT MAX(gw) AS g FROM fixtures WHERE league = ? AND season = ?').bind(lg.id, lg.season).first()).g
    || (lg.format === 'sprint' ? lg.weeks : 38);
  const gw = lg.status === 'live' ? Math.max(1, currentGw(lg.start_n)) : 1;
  const left = Math.max(1, gws - gw + 1);
  const firstSunday = lg.start_n + 7 * gw - 1;
  const link = `https://topflight501.com/j/${showLeague(lg.code)}`;
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Top Flight 501//Leagues//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:gw-${lg.code}-s${lg.season}@topflight501.com`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    `DTSTART;TZID=Europe/Dublin:${ymd(firstSunday)}T190000`,
    'DURATION:PT15M',
    `RRULE:FREQ=WEEKLY;COUNT=${left}`,
    `SUMMARY:${icsText(`🏆 ${lg.name}: gameweek closes tonight`)}`,
    `DESCRIPTION:${icsText(`Last chance to play today's Daily Match for this gameweek's fixture.\n${link}`)}`,
    `URL:${link}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(`${lg.name}: gameweek closes tonight`)}`, 'TRIGGER:PT0M', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR', '',
  ].join('\r\n');
  return new Response(ics, { headers: { 'content-type': 'text/calendar; charset=utf-8', 'content-disposition': `inline; filename="${code}-gameweeks.ics"`, 'cache-control': 'no-store' } });
});
