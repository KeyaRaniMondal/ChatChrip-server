const express = require('express');
require('dotenv').config();
const app = express();
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
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


    //Post Details
    app.get('/posts/:id', async (req, res) => {
      try {
        const postId = req.params.id
        const post = await postCollection.findOne({ _id: new ObjectId(postId) });
        if (!post) {
          return res.status(404).json({ message: 'post not found' });
        }
        res.json(post);
      } catch (error) {
        res.status(500).json({ message: 'Error fetching Post details', error });
      }
    })

    //for upvote and downvote in post details page
    app.patch('/posts/:id/vote', async (req, res) => {
      const { id } = req.params;
      const { voteType } = req.body;
      try {
        const updateField = voteType === 'upvote' ? { $inc: { upvote: 1 } } : { $inc: { downvote: 1 } };
        const result = await postCollection.updateOne({ _id: new ObjectId(id) }, updateField);

        if (result.modifiedCount === 1) {
          res.status(200).send({ message: 'Vote updated successfully' });
        } else {
          res.status(404).send({ message: 'Post not found' });
        }
      } catch (error) {
        console.error('Error updating vote:', error);
        res.status(500).send({ message: 'Failed to update vote' });
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

