import type { RequestHandler } from "express";

export function createMutationGate() {
  let busy = false;
  return (handler: RequestHandler): RequestHandler =>
    async (req, res, next) => {
      if (busy) {
        res.status(409).json({
          error:
            "Another server or world operation is in progress. Try again shortly.",
        });
        return;
      }
      busy = true;
      try {
        await handler(req, res, next);
      } finally {
        busy = false;
      }
    };
}
