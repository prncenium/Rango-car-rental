import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal, ModalBody } from '../src/components/ui/Modal';

afterEach(() => cleanup());

// Regression test: caller-passed `onClose` is routinely an inline closure
// (a new function identity every render of the caller). Typing into a field
// inside the modal re-renders the caller, which previously re-ran the
// focus-trap effect (dependent on `onClose`) and yanked focus to the first
// focusable element (the × button) after every keystroke — see Modal.tsx's
// onCloseRef comment.
function HarnessWithInlineOnClose() {
  const [open, setOpen] = useState(true);
  const [text, setText] = useState('');
  return (
    <Modal open={open} onClose={() => setOpen(false)} title="Test modal">
      <ModalBody>
        <textarea aria-label="Note" value={text} onChange={(e) => setText(e.target.value)} />
      </ModalBody>
    </Modal>
  );
}

describe('Modal — focus stability while typing', () => {
  it('does not steal focus back to the close button after each keystroke', async () => {
    const user = userEvent.setup();
    render(<HarnessWithInlineOnClose />);

    const textarea = screen.getByLabelText('Note');
    textarea.focus();
    await user.type(textarea, 'hello');

    expect(textarea).toHaveValue('hello');
    expect(document.activeElement).toBe(textarea);
  });
});
