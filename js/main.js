/* OST website. No framework, no tracking.
   Programme data: data/events.json in the Klubtool public-feed shape
   (id, title, date, start_time, end_time, presstext = ticket link, attachments[0].url = artwork, bookings[] = line-up).
   Set window.OST_FEED before this script to point at another URL.
   Contact form: window.OST_CONTACT = { endpoint, booking, contact, job, lost }.
   With an endpoint the form POSTs JSON there (Klubtool later); without one it opens
   the visitor's mail app with the message addressed to the subject's address. */
(function () {
  'use strict';
  var FEED = window.OST_FEED || 'data/events.json';
  var CONTACT = window.OST_CONTACT || {};
  var ADDRESS = {
    booking: CONTACT.booking || 'ahoi@ost-hafen.berlin',
    contact: CONTACT.contact || 'ahoi@ost-hafen.berlin',
    job: CONTACT.job || 'ahoi@ost-hafen.berlin',
    lost: CONTACT.lost || 'lost@clubost.de'
  };
  var TZ = 'Europe/Berlin';
  var VISIBLE = 11; // posters shown before "Show all nights"

  /* ---------- nav / menu ---------- */
  var burger = document.getElementById('burger');
  var menu = document.getElementById('menu');
  function setMenu(open) {
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    menu.hidden = !open;
    document.body.classList.toggle('menu-open', open);
  }
  if (burger && menu) {
    burger.addEventListener('click', function () { setMenu(menu.hidden); });
    menu.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !menu.hidden) setMenu(false); });
    window.matchMedia('(min-width: 901px)').addEventListener('change', function (m) { if (m.matches) setMenu(false); });
  }

  /* ---------- time helpers (everything in Berlin time) ---------- */
  function berlinParts(d) {
    var p = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
    var o = {};
    p.forEach(function (x) { o[x.type] = x.value; });
    return { ymd: o.year + '-' + o.month + '-' + o.day, hm: (o.hour === '24' ? '00' : o.hour) + ':' + o.minute };
  }
  function addDays(ymd, n) {
    var d = new Date(ymd + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  // Berlin wall-clock "date + time" as a comparable string "YYYY-MM-DD HH:MM"
  function stamp(ymd, hm) { return ymd + ' ' + hm; }
  function weekday(ymd, style) {
    return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: style || 'short' }).format(new Date(ymd + 'T12:00:00Z'));
  }
  function dayMonth(ymd, long) {
    return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: 'numeric', month: long ? 'long' : 'short' }).format(new Date(ymd + 'T12:00:00Z'));
  }
  function year(ymd) { return ymd.slice(0, 4); }

  /* ---------- data ---------- */
  function splitTitle(raw) {
    var m = /^\s*\[(.+?)\]\s*(.*)$/.exec(raw || '');
    if (m) return { tag: tidy(m[1]), title: m[2] || raw };
    return { tag: null, title: raw || '' };
  }
  function tidy(s) { return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(); }

  function normalise(list) {
    var now = berlinParts(new Date());
    var out = [];
    (list || []).forEach(function (e) {
      if (!e || !e.date) return;
      var start = (e.start_time || '23:00').slice(0, 5);
      var endHm = e.end_time ? e.end_time.slice(0, 5) : null;
      var endYmd = e.date;
      if (endHm) { if (endHm < start) endYmd = addDays(e.date, 1); }
      else { endHm = '07:00'; endYmd = addDays(e.date, 1); }
      var ends = stamp(endYmd, endHm);
      if (ends <= stamp(now.ymd, now.hm)) return; // over
      var t = splitTitle(e.title);
      out.push({
        id: e.id, title: t.title, tag: t.tag, date: e.date, start: start, end: e.end_time ? endHm : null,
        tickets: e.presstext || null,
        art: (e.attachments && e.attachments[0] && e.attachments[0].url) || null,
        artFocus: e.art_focus || null,   // e.g. '24% 50%': where the line-up sits, used as object-position
        artFit: e.art_fit || 'cover',    // 'contain' shows the whole artwork on a blurred copy of itself
        lineup: (e.bookings || []).map(function (b) { return { name: b.artist_name, from: b.set_start, to: b.set_end, floor: b.floor }; }).filter(function (b) { return b.name; }),
        live: stamp(e.date, start) <= stamp(now.ymd, now.hm) || e.date === now.ymd,
        tomorrow: e.date === addDays(now.ymd, 1)
      });
    });
    out.sort(function (a, b) { return (a.date + a.start).localeCompare(b.date + b.start); });
    return out;
  }

  /* ---------- rendering ---------- */
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function artBlock(ev, cls, eager) {
    var box = el('div', cls + (ev.art ? '' : ' ' + cls + '--empty'));
    var img = el('img', 'art__main');
    img.alt = ev.art ? ev.title + ', artwork' : '';
    img.loading = eager ? 'eager' : 'lazy';
    img.decoding = 'async';
    if (ev.art) {
      // artwork fills the tile (cover). art_focus moves the crop onto the line-up; art_fit 'contain' shows it whole on a blurred copy
      if (ev.artFocus) img.style.objectPosition = ev.artFocus;
      if (ev.artFit === 'contain') {
        box.classList.add('art--whole');
        var bg = el('img', 'art__bg');
        bg.alt = ''; bg.setAttribute('aria-hidden', 'true'); bg.decoding = 'async'; bg.loading = img.loading; bg.src = ev.art;
        box.appendChild(bg);
      }
    }
    img.src = ev.art || 'assets/logo/ost-mark-white.png';
    box.appendChild(img);
    return box;
  }
  function whenLabel(ev) {
    if (ev.live) return 'Tonight';
    if (ev.tomorrow) return 'Tomorrow';
    return null;
  }
  function renderFeatured(ev) {
    var root = document.getElementById('featured');
    root.innerHTML = '';
    if (!ev) return;
    root.appendChild(artBlock(ev, 'featured__art', true));
    var body = el('div', 'featured__body');
    var tags = el('div', 'featured__tags');
    var when = whenLabel(ev);
    tags.appendChild(el('span', 'chip' + (when ? ' chip--live' : ''), when || 'Next night'));
    if (ev.tag) tags.appendChild(el('span', 'chip chip--free', ev.tag));
    body.appendChild(tags);
    body.appendChild(el('h3', 'featured__title', ev.title));
    body.appendChild(el('p', 'featured__date', weekday(ev.date, 'long') + ' ' + dayMonth(ev.date, true) + ' ' + year(ev.date) + '. Doors ' + ev.start + (ev.end ? ' to ' + ev.end : '')));
    if (ev.lineup.length) {
      var ul = el('ul', 'lineup');
      ev.lineup.forEach(function (b) {
        var li = el('li', null, b.name);
        if (b.floor || b.from) { var s = el('small', null, [b.floor, b.from ? b.from + (b.to ? ' to ' + b.to : '') : null].filter(Boolean).join(' ')); li.appendChild(s); }
        ul.appendChild(li);
      });
      body.appendChild(ul);
    }
    var cta = el('div', 'featured__cta');
    if (ev.tickets) {
      var a = el('a', 'btn btn--solid btn--lg', 'Tickets');
      a.href = ev.tickets; a.target = '_blank'; a.rel = 'noopener';
      cta.appendChild(a);
    } else {
      cta.appendChild(el('span', 'chip', 'Tickets at the door'));
    }
    body.appendChild(cta);
    root.appendChild(body);
  }
  function renderPosters(list) {
    var ul = document.getElementById('posters');
    var more = document.getElementById('show-all');
    var count = document.getElementById('grid-count');
    ul.innerHTML = '';
    list.forEach(function (ev, i) {
      var li = el('li', 'poster');
      if (i >= VISIBLE) li.hidden = true;
      var a = el('a');
      a.href = ev.tickets || '#programme';
      if (ev.tickets) { a.target = '_blank'; a.rel = 'noopener'; }
      a.setAttribute('aria-label', ev.title + ', ' + weekday(ev.date, 'long') + ' ' + dayMonth(ev.date, true) + (ev.tickets ? ', tickets' : ''));
      a.appendChild(artBlock(ev, 'poster__art', i < 8));
      var meta = el('div', 'poster__meta');
      meta.appendChild(el('p', 'poster__date', weekday(ev.date) + ' ' + dayMonth(ev.date) + (year(ev.date) !== year(list[0].date) ? ' ' + year(ev.date) : '')));
      meta.appendChild(el('p', 'poster__title', ev.title));
      if (ev.tag) meta.appendChild(el('span', 'chip chip--free poster__chip', ev.tag));
      a.appendChild(meta);
      li.appendChild(a);
      ul.appendChild(li);
    });
    count.textContent = list.length ? list.length + (list.length === 1 ? ' night' : ' nights') + ' announced' : '';
    more.hidden = list.length <= VISIBLE;
    more.onclick = function () {
      ul.querySelectorAll('.poster[hidden]').forEach(function (n) { n.hidden = false; });
      more.hidden = true;
    };
  }
  function wireTickets(ev) {
    document.querySelectorAll('[data-next-tickets]').forEach(function (a) {
      if (ev && ev.tickets) a.href = ev.tickets;
    });
  }
  function jsonLd(list) {
    var data = list.slice(0, 20).map(function (ev) {
      var o = {
        '@context': 'https://schema.org', '@type': 'MusicEvent', name: ev.title,
        startDate: ev.date + 'T' + ev.start + ':00+01:00',
        eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
        eventStatus: 'https://schema.org/EventScheduled',
        location: { '@type': 'NightClub', name: 'OST', address: { '@type': 'PostalAddress', streetAddress: 'Alt-Stralau 1', postalCode: '10245', addressLocality: 'Berlin', addressCountry: 'DE' } },
        organizer: { '@type': 'Organization', name: 'OST', url: 'https://clubost.de/' }
      };
      if (ev.art) o.image = new URL(ev.art, location.href).href;
      if (ev.tickets) o.offers = { '@type': 'Offer', url: ev.tickets, availability: 'https://schema.org/InStock' };
      if (ev.lineup.length) o.performer = ev.lineup.map(function (b) { return { '@type': 'MusicGroup', name: b.name }; });
      return o;
    });
    var s = document.createElement('script');
    s.type = 'application/ld+json';
    s.textContent = JSON.stringify(data);
    document.head.appendChild(s);
  }
  function render(raw) {
    var list = normalise(raw);
    var empty = document.getElementById('empty');
    var head = document.querySelector('.grid-head');
    if (!list.length) {
      renderFeatured(null);
      renderPosters([]);
      empty.hidden = false;
      head.hidden = true;
      return;
    }
    empty.hidden = true;
    head.hidden = false;
    renderFeatured(list[0]);
    renderPosters(list.slice(1));
    wireTickets(list[0]);
    jsonLd(list);
  }

  /* ---------- contact dialog ---------- */
  var dialog = document.getElementById('contact');
  var form = document.getElementById('contact-form');
  var doneBox = document.getElementById('contact-done');
  var status = document.getElementById('contact-status');
  if (dialog && form && typeof dialog.showModal === 'function') {
    var LABEL = { booking: 'Booking', contact: 'Contact', job: 'Job', lost: 'Lost item' };
    var HINT = {
      booking: 'Artists and agencies: who you are, what you play, where we can listen. Venue requests: date, size and what you have in mind.',
      contact: 'Press, partnerships and everything else. Guest list and ticket questions go to the door and Resident Advisor, not here.',
      job: 'Bar, door, runner, cloakroom, tech. Tell us what you have done and when you can start.',
      lost: 'Say what you lost and where you last had it. We check the box after every weekend.'
    };
    var MSG = { booking: 'Your request', contact: 'Message', job: 'About you', lost: 'What did you lose?' };
    var lastFocus = null;

    function subject() {
      var r = form.querySelector('input[name="subject"]:checked');
      return r ? r.value : 'contact';
    }
    function sync() {
      var s = subject();
      var kind = form.elements.booking_kind ? form.elements.booking_kind.value : '';
      form.querySelectorAll('[data-for]').forEach(function (n) {
        var show = n.getAttribute('data-for').split(' ').some(function (w) {
          var p = w.split(':');
          return p[0] === s && (!p[1] || p[1] === kind);
        });
        n.hidden = !show;
        n.querySelectorAll('input, select, textarea').forEach(function (f) { f.disabled = !show; });
      });
      document.getElementById('contact-hint').textContent = HINT[s];
      document.getElementById('message-label').textContent = MSG[s];
    }
    function setStatus(html) { status.innerHTML = html; }
    function openDialog(s) {
      lastFocus = document.activeElement;
      var r = form.querySelector('input[name="subject"][value="' + (LABEL[s] ? s : 'contact') + '"]');
      if (r) r.checked = true;
      form.hidden = false;
      doneBox.hidden = true;
      setStatus('');
      sync();
      dialog.showModal();
      var first = form.querySelector('input[name="name"]');
      if (first && window.matchMedia('(min-width: 641px)').matches) first.focus();
    }
    document.addEventListener('click', function (e) {
      var t = e.target.closest('[data-contact]');
      if (t) { e.preventDefault(); openDialog(t.getAttribute('data-contact')); return; }
      if (e.target.closest('[data-contact-close]')) dialog.close();
    });
    dialog.addEventListener('click', function (e) { if (e.target === dialog) dialog.close(); });
    dialog.addEventListener('close', function () { if (lastFocus && lastFocus.focus) lastFocus.focus(); });
    form.addEventListener('change', sync);
    // index.html?contact=booking (used by the legal pages' footer) opens the dialog straight away
    var want = new URLSearchParams(location.search).get('contact');
    if (want && LABEL[want]) {
      openDialog(want);
      if (history.replaceState) history.replaceState(null, '', location.pathname + location.hash);
    }

    function collect() {
      var o = { subject: subject(), subject_label: LABEL[subject()], page: location.href, sent_at: new Date().toISOString() };
      Array.prototype.forEach.call(form.elements, function (f) {
        if (!f.name || f.disabled || f.name === 'subject' || f.name === 'agreement') return;
        if (f.value && f.value.trim()) o[f.name] = f.value.trim();
      });
      return o;
    }
    function asText(o) {
      var skip = { subject: 1, subject_label: 1, page: 1, sent_at: 1, message: 1, website: 1 };
      var lines = [];
      Object.keys(o).forEach(function (k) {
        if (skip[k]) return;
        lines.push(k.replace(/_/g, ' ').replace(/^./, function (c) { return c.toUpperCase(); }) + ': ' + o[k]);
      });
      return lines.join('\n') + '\n\n' + (o.message || '') + '\n\n(sent from ' + location.host + ')';
    }
    function showDone() {
      form.hidden = true;
      doneBox.hidden = false;
      var b = doneBox.querySelector('button'); if (b) b.focus();
    }
    function fallback(o) {
      var to = ADDRESS[o.subject] || ADDRESS.contact;
      var href = 'mailto:' + to + '?subject=' + encodeURIComponent('OST website: ' + o.subject_label + ' request from ' + (o.name || '')) + '&body=' + encodeURIComponent(asText(o));
      window.location.href = href;
      setStatus('Your mail app opens with the message ready to send. If nothing happens, write to <a href="' + href + '">' + to + '</a>.');
    }
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!form.reportValidity()) return;
      var o = collect();
      if (o.website) { showDone(); return; } // bots fill the hidden field
      var send = document.getElementById('contact-send');
      if (CONTACT.endpoint && window.fetch) {
        send.disabled = true;
        setStatus('Sending');
        fetch(CONTACT.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(o) })
          .then(function (r) { if (!r.ok) throw new Error(r.status); showDone(); form.reset(); })
          .catch(function () {
            setStatus('That did not go through. Write to <a href="mailto:' + (ADDRESS[o.subject] || ADDRESS.contact) + '">' + (ADDRESS[o.subject] || ADDRESS.contact) + '</a> instead.');
          })
          .then(function () { send.disabled = false; });
      } else {
        fallback(o);
      }
    });
  }

  /* ---------- newsletter (double opt-in through Klubtool) ---------- */
  var NEWSLETTER = window.OST_NEWSLETTER || {};
  var nlForm = document.getElementById('newsletter-form');
  if (nlForm) {
    var nlStatus = document.getElementById('newsletter-status');
    var nlDone = document.getElementById('newsletter-done');
    var nlSend = document.getElementById('newsletter-send');
    var NL_MSG = {
      sent: ['Check your inbox', 'We sent you a mail with a confirmation link. The subscription only starts once you click it. Nothing there? Look in spam.'],
      confirmed: ['You are on the list', 'Thanks. The next newsletter comes to this address. Every mail has a link to unsubscribe.'],
      unsubscribed: ['You are off the list', 'Done. No more newsletters to this address.'],
      invalid: ['That link is no longer valid', 'Sign up again if you want the newsletter.']
    };
    function nlShow(state) {
      var m = NL_MSG[state];
      if (!m) return;
      nlForm.hidden = state !== 'invalid';
      nlDone.hidden = false;
      nlDone.querySelector('.newsletter__done-title').textContent = m[0];
      nlDone.querySelector('.newsletter__done-text').textContent = m[1];
    }
    nlForm.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!nlForm.reportValidity()) return;
      var f = nlForm.elements;
      if (f.website && f.website.value) { nlShow('sent'); return; } // bots fill the hidden field
      if (!NEWSLETTER.endpoint || !window.fetch) { nlStatus.textContent = 'The sign-up is not connected yet.'; return; }
      var payload = {
        email: f.email.value.trim(),
        first_name: f.first_name.value.trim(),
        consent: !!f.agreement.checked,
        // the sentence the person ticked, stored with the sign-up as proof
        consent_text: document.getElementById('nl-consent').textContent.replace(/\s+/g, ' ').trim(),
        language: 'en',
        return_url: location.origin + location.pathname,
        source: 'website',
        website: ''
      };
      nlSend.disabled = true;
      nlStatus.textContent = 'Sending';
      fetch(NEWSLETTER.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        .then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, status: r.status, body: j }; });
        })
        .then(function (res) {
          if (res.ok) { nlStatus.textContent = ''; nlForm.reset(); nlShow('sent'); return; }
          if (res.body && res.body.error === 'email') nlStatus.textContent = 'That e-mail address does not look right.';
          else if (res.status === 429) nlStatus.textContent = 'Too many tries. Please wait a few minutes.';
          else nlStatus.textContent = 'That did not go through. Please try again later.';
        })
        .catch(function () { nlStatus.textContent = 'That did not go through. Please try again later.'; })
        .then(function () { nlSend.disabled = false; });
    });
    // Back from a mail link: index.html?newsletter=confirmed|unsubscribed|invalid
    var nlState = new URLSearchParams(location.search).get('newsletter');
    if (nlState && NL_MSG[nlState]) {
      nlShow(nlState);
      if (history.replaceState) history.replaceState(null, '', location.pathname + '#newsletter');
      var nlSection = document.getElementById('newsletter');
      if (nlSection) nlSection.scrollIntoView();
    }
  }

  /* ---------- load: feed first, inline copy as fallback ---------- */
  function inline() {
    try { return JSON.parse(document.getElementById('events-data').textContent); } catch (e) { return []; }
  }
  var done = false;
  if (!document.getElementById('posters')) {
    // legal pages: nav and dialog only, no programme
  } else if (window.fetch && location.protocol !== 'file:') {
    fetch(FEED, { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (data) { done = true; render(data); })
      .catch(function () { if (!done) render(inline()); });
  } else {
    render(inline());
  }
})();
