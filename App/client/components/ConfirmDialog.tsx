import { useEffect, useRef } from "react";

export type Confirmation = {
  title: string;
  detail: string;
  confirmLabel: string;
  action: () => Promise<unknown>;
};

export function ConfirmDialog({
  confirmation,
  onCancel,
}: {
  confirmation: Confirmation;
  onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    cancel.current?.focus();
    return () => element?.close();
  }, []);

  return (
    <dialog
      ref={dialog}
      className="confirm-dialog"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-detail"
      onCancel={onCancel}
    >
      <p className="eyebrow">BEFORE YOU CONTINUE</p>
      <h2 id="confirm-title">{confirmation.title}</h2>
      <p id="confirm-detail">{confirmation.detail}</p>
      <div className="actions">
        <button
          type="button"
          ref={cancel}
          className="button secondary"
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          className="button primary"
          onClick={() => void confirmation.action()}
        >
          {confirmation.confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
