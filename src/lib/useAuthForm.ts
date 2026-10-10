"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import type { z } from "zod";
import { getErrors } from "./validation";

export function useAuthForm<T extends Record<string, string>>(
  schema: z.ZodType,
  initial: T
) {
  const [values, setValues] = useState<T>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const field = (name: keyof T & string) => ({
    name,
    value: values[name],
    error: errors[name],
    onChange: (v: string) => {
      setValues((p) => ({ ...p, [name]: v }));
      if (errors[name]) {
        setErrors((p) => {
          const next = { ...p };
          delete next[name];
          return next;
        });
      }
    },
    onBlur: () => {
      const e = getErrors(schema, values);
      setErrors((p) => ({ ...p, [name]: e[name] }));
    },
  });

  const handleSubmit =
    (onValid: (v: T) => Promise<void> | void) => async (e: FormEvent) => {
      e.preventDefault();
      setMessage(null);
      const errs = getErrors(schema, values);
      setErrors(errs);
      if (Object.keys(errs).length > 0) return;
      setLoading(true);
      try {
        await onValid(values);
      } finally {
        setLoading(false);
      }
    };

  return { field, handleSubmit, loading, message, setMessage, values };
}