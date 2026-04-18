import { PublicClientApplication } from "@azure/msal-browser";

const msalConfig = {
  auth: {
    clientId: "9982e25d-66bc-41fa-b62b-2e73f6a96ea0", // from Azure
    authority: "https://login.microsoftonline.com/common",
    redirectUri: "http://localhost:5173"
  }
};

export const msalInstance = new PublicClientApplication(msalConfig);