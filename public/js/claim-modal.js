/**
 * CS52-4 § Claim prompt modal — extracted for unit testability.
 *
 * Renders an accessible modal (focus trap, ESC = decline, Enter = accept,
 * backdrop click = decline). Returns a Promise that resolves to 'accept'
 * or 'decline'. Telemetry is emitted via console.info so tests can spy.
 *
 * Builds the DOM programmatically (createElement / appendChild) instead of
 * .innerHTML so tests can drive it through a tiny ad-hoc DOM stand-in
 * without pulling in jsdom.
 */
export function showClaimPromptModal({
  total,
  unattachedCount,
  mismatchedCount,
  onAccept,
  onDecline,
} = {}) {
  return new Promise(resolve => {
    const previousActive = document.activeElement;
    const backdrop = document.createElement('div');
    backdrop.className = 'claim-modal-backdrop';

    const modal = document.createElement('div');
    modal.className = 'claim-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'claim-modal-title');
    modal.setAttribute('aria-describedby', 'claim-modal-message');
    modal.setAttribute('tabindex', '-1');

    const title = document.createElement('h2');
    title.className = 'claim-modal-title';
    title.id = 'claim-modal-title';
    title.textContent = 'Add offline games to your account?';

    const message = document.createElement('p');
    message.className = 'claim-modal-message';
    message.id = 'claim-modal-message';
    message.textContent = `${total} pending offline games will be added to your account.`;

    const actions = document.createElement('div');
    actions.className = 'claim-modal-actions';

    const declineBtn = document.createElement('button');
    declineBtn.type = 'button';
    declineBtn.className = 'btn btn-secondary';
    declineBtn.setAttribute('data-action', 'claim-decline');
    declineBtn.textContent = 'Not now';

    const acceptBtn = document.createElement('button');
    acceptBtn.type = 'button';
    acceptBtn.className = 'btn btn-primary';
    acceptBtn.setAttribute('data-action', 'claim-accept');
    acceptBtn.textContent = 'Add to my account';

    actions.appendChild(declineBtn);
    actions.appendChild(acceptBtn);
    modal.appendChild(title);
    modal.appendChild(message);
    modal.appendChild(actions);
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    const focusables = [declineBtn, acceptBtn].filter(Boolean);
    let focusIdx = focusables.length > 1 ? 1 : 0;
    const setFocus = () => {
      if (focusables.length === 0) {
        modal?.focus?.();
        return;
      }
      focusables[focusIdx]?.focus();
    };

    function cleanup() {
      backdrop.removeEventListener('keydown', onKey);
      backdrop.remove();
      if (previousActive && typeof previousActive.focus === 'function') previousActive.focus();
    }
    function accept() {
      try { console.info('[client] claim_prompt_accepted', { claimedCount: total }); } catch { /* ignore */ }
      cleanup();
      try { onAccept && onAccept(); } catch { /* ignore */ }
      resolve('accept');
    }
    function decline() {
      try { console.info('[client] claim_prompt_declined', { pendingCount: total }); } catch { /* ignore */ }
      cleanup();
      try { onDecline && onDecline(); } catch { /* ignore */ }
      resolve('decline');
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault && e.preventDefault(); decline(); return; }
      if (e.key === 'Tab') {
        e.preventDefault && e.preventDefault();
        if (focusables.length === 0) return;
        focusIdx = (focusIdx + (e.shiftKey ? -1 : 1) + focusables.length) % focusables.length;
        setFocus();
        return;
      }
      if (e.key === 'Enter') {
        // Per the documented contract Enter always accepts, regardless of
        // which button currently has focus inside the modal.
        e.preventDefault && e.preventDefault();
        accept();
      }
    }

    acceptBtn.addEventListener('click', accept);
    declineBtn.addEventListener('click', decline);
    backdrop.addEventListener('keydown', onKey);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) decline();
    });

    try {
      console.info('[client] claim_prompt_shown', { unattachedCount, mismatchedCount });
    } catch { /* ignore */ }

    if (modal && modal.focus) modal.focus();
    setFocus();
  });
}
