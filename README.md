# PiRo - Pinterest to Miro Sync App
**Pronounced "py-ro"**

## Overview
PiRo is a powerful tool that seamlessly connects your Pinterest and Miro accounts, allowing you to easily sync and visualize your Pinterest pins directly on Miro boards. Whether you are planning creative projects, brainstorming sessions, or mood boards, PiRo helps you bring your Pinterest inspiration into Miro's endless whiteboard space.

## Key Features
- **Seamless Syncing**: Authenticate both Pinterest and Miro accounts to fetch boards and pins easily.
- **Duplicate Detection**: Avoid duplicate pins on your Miro boards by checking both Pin ID and Miro Object ID.
- **Dynamic Layout**: Automatically places synced pins in an organized, non-overlapping row layout on Miro boards.
- **Error Handling**: Robust error handling with detailed logs for troubleshooting API issues.
- **Endless Whiteboard Space**: Utilizes Miro's limitless canvas to ensure pins are placed in open areas, without overlapping existing objects.
Setup and Installation
Prerequisites
Node.js (v14 or higher)
npm or yarn
MongoDB (for user token persistence)
Pinterest and Miro Developer Accounts (for API keys)
Installation
Clone this repository:

bash
Copy code
git clone https://github.com/Petestam/PiRo.git
cd PiRo
Install dependencies:

bash
Copy code
npm install
Create a .env file in the root directory and populate it with your API keys:

makefile
Copy code
PINTEREST_APP_ID=<Your Pinterest App ID>
PINTEREST_APP_SECRET=<Your Pinterest App Secret>
MIRO_CLIENT_ID=<Your Miro Client ID>
MIRO_CLIENT_SECRET=<Your Miro Client Secret>
MONGODB_URI=<Your MongoDB Connection URI>
Start the server:

bash
Copy code
npm start
Visit http://localhost:3000 in your browser to begin using PiRo.

Authentication
Users need to authenticate both their Pinterest and Miro accounts to allow PiRo to fetch boards and pins. The app uses OAuth2 for secure authentication and stores tokens in MongoDB for session persistence.
Syncing Pins
Navigate to the /boards route after authentication to select the Pinterest and Miro boards you want to sync.
PiRo will automatically detect any duplicate pins by checking both the Pin ID and Miro Object ID, ensuring that only unique pins are added to the Miro board.
Error Handling
Detailed error logs are available in the server console for troubleshooting. The app gracefully handles API errors and provides user-friendly messages.
Contributing
Contributions are welcome! Please open an issue or submit a pull request with your improvements.

License
This project is licensed under the MIT License - see the LICENSE file for details.