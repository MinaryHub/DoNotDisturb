import splashData from '../../../data/splash.json';
import { splashSchema } from '../../core/configSchemas';

// 스플래시: 게임을 열면 먼저 보이는 화면. 아직 언어를 모르니 두 언어를 함께 보여 주고, 여기서 고른 언어로 게임을 연다.
// 알림 거품이 하나씩 흐려지며 사라지는 동안 달(방해 금지)이 떠오른다.

export type SplashLang = 'ko' | 'en';

const cfg = splashSchema.parse(splashData);
const order: SplashLang[] = ['ko', 'en'];

/** 스플래시를 띄우고, 고른 언어를 돌려준다 (클릭·터치·키보드) */
export function runSplash(initial: SplashLang): Promise<SplashLang> {
  return new Promise((resolve) => {
    let pick = initial;
    let ready = false;
    const root = document.createElement('div');
    root.className = 'splash';
    root.style.setProperty('--splash-fade', `${cfg.fadeSec}s`);
    const titles = order.map((l) => `<h1 class="splash__title splash__title--${l}" lang="${l}">${esc(cfg.langs[l].title)}</h1>`).join('');
    const taglines = order.map((l) => `<p class="splash__tagline" lang="${l}">${esc(cfg.langs[l].tagline)}</p>`).join('');
    const buttons = order.map((l, i) => `<button type="button" class="splash__lang" data-lang="${l}" lang="${l}"><kbd>${i + 1}</kbd>${esc(cfg.langs[l].name)}</button>`).join('');
    root.innerHTML = `<div class="splash__box">
        <div class="splash__mark" aria-hidden="true">
          <span class="splash__ping splash__ping--1"></span><span class="splash__ping splash__ping--2"></span><span class="splash__ping splash__ping--3"></span><span class="splash__ping splash__ping--4"></span>
          <span class="splash__moon"></span>
        </div>
        <div class="splash__titles">${titles}</div>
        <div class="splash__taglines">${taglines}</div>
        <div class="splash__pick">
          <p class="splash__choose"></p>
          <div class="splash__langs" role="radiogroup">${buttons}</div>
          <p class="splash__hint"></p>
        </div>
      </div>`;
    document.body.appendChild(root);
    const choose = root.querySelector<HTMLElement>('.splash__choose')!;
    const hint = root.querySelector<HTMLElement>('.splash__hint')!;

    const render = () => {
      root.dataset['lang'] = pick;
      for (const b of root.querySelectorAll<HTMLButtonElement>('.splash__lang')) {
        const on = b.dataset['lang'] === pick;
        b.classList.toggle('on', on);
        b.setAttribute('aria-checked', String(on));
        b.setAttribute('role', 'radio');
      }
      choose.textContent = cfg.langs[pick].choose;
      choose.lang = pick;
      hint.textContent = cfg.langs[pick].hint;
      hint.lang = pick;
    };
    const done = () => {
      if (!ready) return;
      ready = false;
      window.removeEventListener('keydown', onKey, true);
      root.classList.add('splash--out');
      setTimeout(() => {
        root.remove();
        resolve(pick);
      }, 380);
    };
    const onKey = (e: KeyboardEvent) => {
      // 게임 입력으로 새지 않게 여기서 먹는다
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat) return;
      if (e.code === 'ArrowLeft' || e.code === 'ArrowUp' || e.code === 'KeyA' || e.code === 'KeyW') pick = 'ko';
      else if (e.code === 'ArrowRight' || e.code === 'ArrowDown' || e.code === 'KeyD' || e.code === 'KeyS') pick = 'en';
      else if (e.code === 'Tab') pick = pick === 'ko' ? 'en' : 'ko';
      else if (e.code === 'Digit1' || e.code === 'Numpad1') pick = 'ko';
      else if (e.code === 'Digit2' || e.code === 'Numpad2') pick = 'en';
      else if (e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter') return done();
      else return;
      render();
    };
    for (const b of root.querySelectorAll<HTMLButtonElement>('.splash__lang')) {
      b.addEventListener('click', () => {
        pick = b.dataset['lang'] === 'en' ? 'en' : 'ko';
        render();
        // 버튼을 직접 누르면 글자가 다 떠오르기 전이어도 바로 시작
        ready = true;
        done();
      });
    }
    window.addEventListener('keydown', onKey, true);
    render();
    // 글자가 떠오른 뒤부터 고를 수 있다 (실수로 바로 넘어가지 않게)
    setTimeout(() => {
      ready = true;
      root.classList.add('splash--ready');
    }, cfg.fadeSec * 1000);
  });
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
