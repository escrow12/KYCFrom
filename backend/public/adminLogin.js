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

      if (window.Swal) {
        await Swal.fire({
          icon: "success",
          iconColor: "#28a745",
          title: "Sign In Successful",
          text: "Welcome back! Redirecting to dashboard...",
          showConfirmButton: false,
          timer: 1200,
          timerProgressBar: true,
        });
      }

      // Redirect to Client Verification
      window.location.assign(
        "/admin.html"
      );

    } catch (error) {

      loginStatus.textContent =
        error.message ||
        "Unable to sign in.";

      if (window.Swal) {
        Swal.fire({
          icon: "error",
          iconColor: "#dc3545",
          title: "Sign In Failed",
          text: error.message || "Invalid credentials. Please try again.",
          confirmButtonColor: "#dc3545",
          confirmButtonText: "OK",
        });
      }

      loginPassword.value = "";

      loginPassword.focus();

    } finally {

      loginButton.disabled = false;
    }
  }
);