/** HTML overlay in index.html — leaderboard gate + name entry. */

/** Disable only the Phaser canvas so clicks/typing reach the DOM overlay (#app children). Never set pointer-events:none on #app — that blocks the overlay too. */
function setCanvasPointerEvents(enabled: boolean): void {
  const canvas = document.querySelector('#game-mount canvas') as HTMLCanvasElement | null;
  if (canvas) {
    canvas.style.pointerEvents = enabled ? '' : 'none';
  }
}

function getElements() {
  return {
    overlay: document.getElementById('name-entry-overlay'),
    title: document.getElementById('name-entry-title'),
    checking: document.getElementById('name-entry-checking'),
    formRow: document.getElementById('name-entry-form-row'),
    input: document.getElementById('name-entry-input') as HTMLInputElement | null,
    submit: document.getElementById('name-entry-submit'),
  };
}

/** Show the overlay immediately (e.g. right after death) while the server list is fetched. */
export function showLeaderboardChecking(): void {
  const { overlay, title, checking, formRow, input, submit } = getElements();
  if (!overlay || !title || !checking || !formRow || !input || !submit) {
    return;
  }
  title.hidden = true;
  checking.hidden = false;
  formRow.hidden = true;
  input.value = '';
  overlay.hidden = false;
  setCanvasPointerEvents(false);
}

/** Hide overlay and restore default layout for the next open. */
export function hideLeaderboardOverlay(): void {
  const { overlay, title, checking, formRow, input } = getElements();
  input?.blur();
  if (overlay) {
    overlay.hidden = true;
  }
  if (title) {
    title.textContent = 'Top 3 score! Enter your name:';
    title.hidden = false;
  }
  if (checking) {
    checking.hidden = true;
  }
  if (formRow) {
    formRow.hidden = false;
  }
  setCanvasPointerEvents(true);
}

/** Name entry after checking (or standalone). Resolves with name string, or null if dismissed. */
export function promptHighScoreName(): Promise<string | null> {
  return new Promise((resolve) => {
    const { overlay, title, checking, formRow, input, submit } = getElements();
    if (!overlay || !title || !checking || !formRow || !input || !submit) {
      resolve(null);
      return;
    }

    const fromChecking = !checking.hidden;

    if (!fromChecking) {
      setCanvasPointerEvents(false);
      title.hidden = false;
      checking.hidden = true;
      formRow.hidden = false;
      input.value = '';
      overlay.hidden = false;
    } else {
      title.hidden = false;
      title.textContent = 'Top 3 score! Enter your name:';
      checking.hidden = true;
      formRow.hidden = false;
    }

    input.focus();

    const finish = (name: string | null) => {
      hideLeaderboardOverlay();
      submit.removeEventListener('click', onSubmit);
      input.removeEventListener('keydown', onKey);
      resolve(name);
    };

    const onSubmit = () => {
      const name = input.value.trim().slice(0, 24) || 'Anonymous';
      finish(name);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        onSubmit();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        finish(null);
      }
    };

    submit.addEventListener('click', onSubmit);
    input.addEventListener('keydown', onKey);
  });
}
