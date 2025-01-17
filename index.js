const express = require('express');
require('dotenv').config();
const app = express();
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.db_USER}:${process.env.db_PASSWORD}@cluster0.nj8v5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    console.log("Connected to MongoDB!");

    app.get('/', (req, res) => {
      res.send('Forum is running');
    });

    const userCollection = client.db("ForumWebsite").collection("users");
    const postCollection = client.db("ForumWebsite").collection("posts");

    //for users

    app.get('/users', async (req, res) => {
      const email = req.query.email;
      if (!email) {
        return res.status(400).send({ message: "Email is required" });
      }
      const result = await userCollection.findOne({ email });
      if (result) {
        res.send(result);
      } else {
        res.status(404).send({ message: "User not found" });
      }
    });

    app.post('/users', async (req, res) => {
      const user = req.body;
      const result = await userCollection.insertOne(user);
      res.send(result);
    });



    // for posts
    app.post('/posts', async (req, res) => {
      const item = req.body
      const result = await postCollection.insertOne(item)
      res.send(result)
    })

    app.get('/posts', async (req, res) => {
      const { email } = req.query;
      try {
        let query = {}; //fetch all posts
        if (email) {
          query = { authoremail: email }; // Filter by email 
        }
    
        const result = await postCollection.find(query).toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching posts:", error);
        res.status(500).send({ message: "Failed to fetch posts." });
      }
    });
    
    

    // Ping the database
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. Successfully connected to MongoDB!");
  } catch (err) {
    console.error("Error connecting to MongoDB:", err);
  } finally {
    // Uncomment if you want to close the connection after use
    // await client.close();
  }
}

run().catch(console.dir);

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

