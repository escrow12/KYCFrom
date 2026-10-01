const loginForm =
  document.getElementById("loginForm");

const loginIdentifier =
  document.getElementById("loginIdentifier");

const loginPassword =
  document.getElementById("loginPassword");

const loginButton =
  document.getElementById("loginButton");

const loginStatus =
  document.getElementById("loginStatus");


loginForm.addEventListener(
  "submit",
  async (event) => {
    event.preventDefault();


    loginButton.disabled = true;

    loginStatus.textContent =
      "Signing in...";


    try {
      const response = await fetch(
        "/api/admin/auth/login",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          credentials: "include",

          body: JSON.stringify({
            identifier:
              loginIdentifier.value.trim(),

            password:
              loginPassword.value,
          }),
        }
      );


      const result =
        await response.json();


      if (
        !response.ok ||
        !result.success
      ) {
        throw new Error(
          result.message ||
          "Unable to sign in."
        );
      }


      loginPassword.value = "";

      loginStatus.textContent =
        "Login successful. Redirecting...";


      // Redirect to Client Verification
      window.location.assign(
        "/admin.html"
      );

    } catch (error) {

      loginStatus.textContent =
        error.message ||
        "Unable to sign in.";

      loginPassword.value = "";

      loginPassword.focus();

    } finally {

      loginButton.disabled = false;
    }
  }
);