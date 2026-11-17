"use client";

import { Check } from "lucide-react";
import { Alert } from "@/components/arc/alert/alert";
import { Button } from "@/components/arc/button/button";
import { CopyButton } from "@/components/arc/copy-button/copy-button";
import { Dialog, DialogContent } from "@/components/arc/dialog/dialog";
import styles from "../manage.module.css";

/** Shows a server-generated temporary password exactly once. Closing it discards the only copy. */
export function TempPasswordDialog({ who, password, onClose }: { who: string; password: string | null; onClose: () => void }) {
  return (
    <Dialog open={!!password} onOpenChange={(o) => !o && onClose()}>
      {password && (
        <DialogContent title="Temporary password" description={`Give this to ${who}. They must change it when they first sign in.`}>
          <div className={styles.form}>
            <div className={styles.secret}>
              <span>{password}</span>
              <CopyButton value={password} label="Copy password" iconOnly />
            </div>
            <Alert tone="warning" title="Shown only once">
              It is not stored anywhere readable. If it is lost, reset the password again.
            </Alert>
            <Button variant="primary" onClick={onClose}>
              <Check size={16} aria-hidden="true" /> Done
            </Button>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
