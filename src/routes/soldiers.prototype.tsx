import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/soldiers/prototype")({
  beforeLoad: () => {
    throw redirect({ to: "/soldiers-prototype" });
  },
});
