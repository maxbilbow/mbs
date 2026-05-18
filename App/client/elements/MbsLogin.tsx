import { StrictMode, useTransition, type SubmitEvent } from "react";
import { createRoot } from "react-dom/client";

class MbsLogin extends HTMLElement {
  readonly #root = createRoot(this);

  connectedCallback() {
    this.#root.render(
      <StrictMode>
        <MbsLoginForm />
      </StrictMode>,
    );
  }
}

customElements.define("mbs-login", MbsLogin);

function MbsLoginForm() {
  const [pending, startTransition] = useTransition();
  const login = (event: SubmitEvent<HTMLFormElement>) =>
    startTransition(async () => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      const response = await fetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          username: formData.get("username") as string,
          password: formData.get("password") as string,
        }),
      });
      const data = await response.json();
      console.log("Login response:", data);
      if (cookieStore) {
        cookieStore.set({
          name: "token",
          value: data.token,
          path: "/",
          expires: Date.now() + 3600 * 1000, // 1 hour from now
        });
      } else {
        throw Error("No cookie store available, cannot set authentication token");
      }
      window.location.href = "/"; // Redirect to home page after login
    });
  if (pending) {
    return <p>Logging in...</p>;
  }

  return (
    <form id="login-form" onSubmit={login}>
      <h2>Login</h2>
      <label htmlFor="username">Username:</label>
      <input type="text" id="username" name="username" required />
      <label htmlFor="password">Password:</label>
      <input type="password" id="password" name="password" required />
      <button type="submit">Login</button>
    </form>
  );
}
