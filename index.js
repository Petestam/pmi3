const { MongoClient, ObjectId, ServerApiVersion } = require('mongodb');
const express = require('express');
const axios = require('axios');
require('dotenv').config();
const passport = require('passport');
const OAuth2Strategy = require('passport-oauth2').Strategy;
const session = require('express-session');
const cookieParser = require('cookie-parser');

// Initialize Express
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Add express-session middleware
app.use(session({
  secret: 'your_secret_key',  // Replace with a strong, secure key
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }  // Set to true if using HTTPS
}));

// Initialize Passport and Session
app.use(passport.initialize());
app.use(passport.session());

// MongoDB Connection using MongoClient
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function connectToMongoDB() {
  try {
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
  }
}

connectToMongoDB().catch(console.dir);

const database = client.db('pinterestMiroSyncDB');
const usersCollection = database.collection('users');

// Serialize and Deserialize User
passport.serializeUser((user, done) => {
  console.log('Serializing user:', user);
  done(null, user._id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await usersCollection.findOne({ _id: new ObjectId(id) });
    console.log('Deserializing user with ID:', id);
    done(null, user);
  } catch (error) {
    console.error('Error deserializing user:', error);
    done(error, null);
  }
});

// Pinterest OAuth2 strategy
passport.use('pinterest', new OAuth2Strategy({
    authorizationURL: 'https://www.pinterest.com/oauth/',
    tokenURL: 'https://api.pinterest.com/v5/oauth/token',
    clientID: process.env.PINTEREST_APP_ID,
    clientSecret: process.env.PINTEREST_APP_SECRET,
    callbackURL: 'http://localhost:3000/auth/pinterest/callback',
    scope: ['boards:read'],
    customHeaders: {
      'Authorization': 'Basic ' + Buffer.from(process.env.PINTEREST_APP_ID + ':' + process.env.PINTEREST_APP_SECRET).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    passReqToCallback: true  // Pass req to callback function
  },
  async (req, accessToken, refreshToken, profile, done) => {
    try {
      console.log('Pinterest access token received:', accessToken);

      let user = await usersCollection.findOne({ _id: req.user ? req.user._id : null });

      if (!user) {
        user = await usersCollection.findOne({ miroAccessToken: req.cookies.miroAccessToken });
      }

      if (!user) {
        // Insert new user if none found
        const result = await usersCollection.insertOne({ pinterestAccessToken: accessToken });
        user = await usersCollection.findOne({ _id: result.insertedId });
        console.log('New Pinterest user created:', user);
      } else {
        // Update the existing user with Pinterest token
        await usersCollection.updateOne(
          { _id: user._id },
          { $set: { pinterestAccessToken: accessToken } }
        );
        user.pinterestAccessToken = accessToken;
        console.log('Pinterest user updated:', user);
      }

      return done(null, user);
    } catch (error) {
      console.error('Error during Pinterest user creation:', error);
      return done(error);
    }
  }
));

// Miro OAuth2 strategy
passport.use('miro', new OAuth2Strategy({
    authorizationURL: 'https://miro.com/oauth/authorize',
    tokenURL: 'https://api.miro.com/v1/oauth/token',
    clientID: process.env.MIRO_CLIENT_ID,
    clientSecret: process.env.MIRO_CLIENT_SECRET,
    callbackURL: 'http://localhost:3000/auth/miro/callback',
    passReqToCallback: true  // Pass req to callback function
  },
  async (req, accessToken, refreshToken, profile, done) => {
    try {
      console.log('Miro access token received:', accessToken);

      let user = await usersCollection.findOne({ _id: req.user ? req.user._id : null });

      if (!user) {
        user = await usersCollection.findOne({ pinterestAccessToken: req.cookies.pinterestAccessToken });
      }

      if (!user) {
        // Insert new user if none found
        const result = await usersCollection.insertOne({ miroAccessToken: accessToken });
        user = await usersCollection.findOne({ _id: result.insertedId });
        console.log('New Miro user created:', user);
      } else {
        // Update the existing user with Miro token
        await usersCollection.updateOne(
          { _id: user._id },
          { $set: { miroAccessToken: accessToken } }
        );
        user.miroAccessToken = accessToken;
        console.log('Miro user updated:', user);
      }

      return done(null, user);
    } catch (error) {
      console.error('Error during Miro user creation:', error);
      return done(error);
    }
  }
));

// Function to fetch pins from Pinterest using an access token
async function fetchPinsFromPinterest(accessToken) {
  try {
    const response = await axios.get('https://api.pinterest.com/v5/pins', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    console.log('Fetched pins from Pinterest:', response.data.items);
    return response.data.items; // Assuming the pins are located in response.data.items
  } catch (error) {
    console.error('Error fetching pins from Pinterest:', error);
    throw error;
  }
}

// Middleware to check if both tokens are present
function ensureAuthenticated(req, res, next) {
  if (req.cookies.pinterestAccessToken && req.cookies.miroAccessToken) {
    return next();
  } else {
    console.log('Tokens missing, redirecting to authentication');
    if (!req.cookies.pinterestAccessToken) {
      return res.redirect('/auth/pinterest');
    }
    if (!req.cookies.miroAccessToken) {
      return res.redirect('/auth/miro');
    }
  }
}

// Example route where the tokens should be checked
app.get('/dashboard', ensureAuthenticated, (req, res) => {
  res.send('Tokens are valid, displaying dashboard.');
});

// Routes
app.get('/', (req, res) => {
  if (req.isAuthenticated()) {
    console.log('User is authenticated, redirecting to /boards');
    return res.redirect('/boards');
  }
  console.log('User not authenticated, showing login options');
  res.send(`
    <h1>Welcome to Pinterest-Miro Sync</h1>
    <a href="/auth/pinterest">Login with Pinterest</a>
    <a href="/auth/miro">Login with Miro</a>
  `);
});

app.get('/auth/pinterest', (req, res, next) => {
  const redirectUri = process.env.PINTEREST_REDIRECT_URI || 'http://localhost:3000/auth/pinterest/callback';
  const clientId = process.env.PINTEREST_APP_ID;

  // Debugging: Log the client ID and the generated OAuth URL
  console.log("Pinterest App ID:", clientId);
  console.log("Pinterest Redirect URI:", redirectUri);

  const pinterestOAuthUrl = `https://www.pinterest.com/oauth/?response_type=code&redirect_uri=${redirectUri}&client_id=${clientId}&scope=boards:read,pins:read,boards:read_secret,pins:read_secret`;

  // Clear old tokens if the session is not authenticated
  if (!req.isAuthenticated()) {
    res.clearCookie('pinterestAccessToken');
    res.clearCookie('miroAccessToken');
    console.log('Cleared old tokens due to unauthenticated session.');
  }

  // If both tokens are present, redirect to /boards
  if (req.cookies.pinterestAccessToken && req.cookies.miroAccessToken) {
    console.log('Both tokens are present, redirecting to /boards');
    return res.redirect('/boards');
  }

  console.log('Starting Pinterest authentication');
  console.log("Pinterest OAuth URL:", pinterestOAuthUrl);
  res.redirect(pinterestOAuthUrl);
});


app.get('/auth/pinterest/callback', (req, res, next) => {
  passport.authenticate('pinterest', (err, user, info) => {
    if (err) {
      console.error('Error during Pinterest authentication:', err);
      return res.status(500).send('Failed to obtain access token. Please try again.');
    }

    if (!user) {
      console.error('No user returned from Pinterest authentication');
      return res.status(500).send('Authentication failed. Please try again.');
    }

    req.logIn(user, (loginErr) => {
      if (loginErr) {
        console.error('Login error:', loginErr);
        return res.status(500).send('Login error. Please try again.');
      }

      console.log('User logged in successfully');
      res.cookie('pinterestAccessToken', user.pinterestAccessToken, { httpOnly: true });
      res.redirect('/boards');
    });
  })(req, res, next);
});

app.get('/auth/miro', passport.authenticate('miro'));

app.get('/auth/miro/callback', (req, res, next) => {
  passport.authenticate('miro', (err, user, info) => {
    if (err) {
      console.error('Error during Miro authentication:', err);
      return res.status(500).send('Failed to obtain access token. Please try again.');
    }

    if (!user) {
      console.error('No user returned from Miro authentication');
      return res.status(500).send('Authentication failed. Please try again.');
    }

    req.logIn(user, (loginErr) => {
      if (loginErr) {
        console.error('Login error:', loginErr);
        return res.status(500).send('Login error. Please try again.');
      }

      console.log('User logged in successfully');
      res.cookie('miroAccessToken', user.miroAccessToken, { httpOnly: true });
      res.redirect('/boards');
    });
  })(req, res, next);
});

// The /boards route
app.get('/boards', async (req, res) => {
  if (!req.isAuthenticated()) {
    console.log('User not authenticated, redirecting to /');
    return res.redirect('/');
  }

  const user = req.user;

  if (!req.cookies.pinterestAccessToken) {
    console.log('Pinterest token missing, redirecting to /auth/pinterest');
    return res.redirect('/auth/pinterest');
  }

  if (!req.cookies.miroAccessToken) {
    console.log('Miro token missing, redirecting to /auth/miro');
    return res.redirect('/auth/miro');
  }

  console.log('Miro Access Token:', req.cookies.miroAccessToken);

  try {
    // Ping Miro API to check connectivity
    console.log('Pinging Miro API...');
    const miroPingResponse = await axios.get('https://api.miro.com/v2/boards', {
      headers: { Authorization: `Bearer ${req.cookies.miroAccessToken}` }
    });
    console.log('Miro API Ping successful:', miroPingResponse.status);

    const pinterestResponse = await axios.get('https://api.pinterest.com/v5/boards/', {
      headers: { Authorization: `Bearer ${req.cookies.pinterestAccessToken}` }
    });

    const miroResponse = await axios.get('https://api.miro.com/v2/boards', {
      headers: { Authorization: `Bearer ${req.cookies.miroAccessToken}` }
    });

    console.log('Pinterest API response:', JSON.stringify(pinterestResponse.data, null, 2));
    console.log('Miro API response:', JSON.stringify(miroResponse.data, null, 2));

    // Extract board data based on the actual structure of the responses
    const pinterestBoards = pinterestResponse.data.items;  // Use 'items' for Pinterest
    const miroBoards = miroResponse.data.data;  // Use 'data' for Miro

    if (!pinterestBoards || !miroBoards) {
      throw new Error('Boards data is missing or improperly formatted');
    }

    res.send(`
      <form action="/sync-pins" method="get">
        <label for="pinterestBoard">Select Pinterest Board:</label>
        <select name="pinterestBoard">
          ${pinterestBoards.map(board => `<option value="${board.id}">${board.name}</option>`).join('')}
        </select>
        <br/>
        <label for="miroBoard">Select Miro Board:</label>
        <select name="miroBoard">
          ${miroBoards.map(board => `<option value="${board.id}">${board.name}</option>`).join('')}
        </select>
        <br/>
        <button type="submit">Sync</button>
      </form>
    `);
  } catch (error) {
    if (error.response) {
      console.error('Error fetching boards:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data,
      });

      if (error.response.status === 401) {
        console.error('Authentication error: Check if the access tokens are valid and have not expired.');
        return res.status(401).send('Authentication error. Please try logging in again.');
      } else if (error.response.status === 403) {
        console.error('Authorization error: You do not have the necessary permissions to access this resource.');
        return res.status(403).send('Authorization error. Please ensure you have the correct permissions.');
      } else if (error.response.status === 400) {
        console.error('Bad request: The request format might be incorrect.');
        return res.status(400).send('Bad request. Please check the request format.');
      } else if (error.response.status === 404) {
        console.error('Resource not found: The requested resource could not be found.');
        return res.status(404).send('Resource not found. Please check the resource ID.');
      } else {
        console.error('Unknown error occurred:', error.response.statusText);
        return res.status(error.response.status).send('An error occurred. Please try again later.');
      }
    } else if (error.request) {
      console.error('No response received from the server:', error.request);
      return res.status(500).send('No response received from the server. Please try again later.');
    } else {
      console.error('Unexpected error:', error.message);
      return res.status(500).send('An unexpected error occurred. Please try again later.');
    }
  }
});

// Route to sync pins from Pinterest to Miro
app.get('/sync-pins', async (req, res) => {
  let pins; // Initialize pins variable
  try {
      // Fetch the Pinterest pins using your Pinterest access token
      pins = await fetchPinsFromPinterest(req.cookies.pinterestAccessToken);

      // Logging the retrieved pins for debugging
      console.log("Fetched Pins:", JSON.stringify(pins, null, 2));

      // Check if the pins are an array
      if (!Array.isArray(pins)) {
          throw new TypeError(`Expected pins to be an array, but received: ${typeof pins}`);
      }

      // Iterate over each pin and post the image to Miro
      for (const pin of pins) {
          console.log("Processing Pin ID:", pin.id);

          if (pin.media && pin.media.images) {
              // Attempt to use the 'original' image if available, else fall back to another size
              const imageUrl = pin.media.images['original']?.url ||
                  pin.media.images['1200x']?.url ||
                  pin.media.images['600x']?.url ||
                  pin.media.images['400x300']?.url ||
                  pin.media.images['150x150']?.url;

              if (imageUrl) {
                  console.log('Pin image URL:', imageUrl);

                 // Corrected payload construction
const payload = {
  data: {
      url: imageUrl, // Use the selected image URL
      title: pin.title || 'Untitled' // Provide a fallback if the title is null/empty
      // Removed 'description' field as it's not supported by the Miro API
  }
};

console.log("Miro API Request Payload:", JSON.stringify(payload, null, 2));

try {
  // Post each pin image to the Miro board
  const miroResponse = await axios.post(`https://api.miro.com/v2/boards/${req.query.miroBoard}/images`, payload, {
      headers: {
          Authorization: `Bearer ${req.cookies.miroAccessToken}`,
          'Content-Type': 'application/json',
      }
  });

  // Check if the image was successfully created
  if (miroResponse && miroResponse.data && miroResponse.data.id) {
      console.log(`Pin ID ${pin.id} successfully created on Miro board with ID: ${miroResponse.data.id}`);
  } else {
      console.warn(`Pin ID ${pin.id} failed to create on Miro board.`);
  }
} catch (err) {
  if (err.response) {
      if (err.response.status === 400) {
          console.error(`400 Error: Invalid parameters sent to Miro API for Pin ID ${pin.id}.`);
          console.error("Miro API Error Response Data:", JSON.stringify(err.response.data, null, 2));
      } else if (err.response.status === 404) {
          console.error(`404 Error: The requested Miro board ID ${req.query.miroBoard} was not found.`);
      } else {
          console.error(`Error creating image for Pin ID ${pin.id}:`, err);
      }
  } else {
      console.error(`Error creating image for Pin ID ${pin.id}:`, err);
  }
}


              } else {
                  console.warn(`Pin ID ${pin.id} does not have any usable image data.`);
              }
          } else {
              console.warn(`Pin ID ${pin.id} is missing media or images data.`);
          }
      }

      console.log('All pins synced to Miro board successfully');
      res.send('Pins synced to Miro board successfully!');
  } catch (error) {
      // Verbose error logging
      console.error("Error syncing pins:", error);
      console.error("Error details:", {
          message: error.message,
          stack: error.stack,
          name: error.name,
          pinsData: pins || 'No pins data available' // Include the data that caused the error, if available
      });

      res.status(500).send('Failed to sync pins. Check server logs for details.');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});