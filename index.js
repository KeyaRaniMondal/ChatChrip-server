const express = require('express');
const stripe = require('stripe')('sk_test_51Qf2NTA9P4PURBiwgPJJtOKkt6QJtFTx1KBetGoUokoT5EowSb1AsDT6Vk2YrwD6trJFzULb9qBSSe4IrAc12TaZ00CY0ANucb');
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
    const paymentCollection = client.db("ForumWebsite").collection("payments");

    //for users

    // app.get('/users', async (req, res) => {
    //   const email = req.query.email;
    //   if (!email) {
    //     return res.status(400).send({ message: "Email is required" });
    //   }
    //   const result = await userCollection.findOne({ email });
    //   if (result) {
    //     res.send(result);
    //   } else {
    //     res.status(404).send({ message: "User not found" });
    //   }
    // });
    app.get('/users', async (req, res) => {
      try {
        const users = await userCollection.find().toArray();
        res.send(users);
      } catch (error) {
        res.status(500).send({ message: 'Failed to fetch users', error });
      }
    });


    app.post('/users', async (req, res) => {
      const user = req.body;
      const result = await userCollection.insertOne(user);
      res.send(result);
    });



    // for posts
    // API to count posts for a specific user
    app.get("/posts/count", async (req, res) => {
      try {
        const { email } = req.query;

        if (!email) {
          return res.status(400).send({ message: "Email is required" });
        }

        const postCount = await postCollection.countDocuments({ authoremail: email });

        res.json({ count: postCount });
      } catch (error) {
        res.status(500).send({ message: "Error counting posts", error });
      }
    });

    app.post('/posts', async (req, res) => {
      try {
        const item = req.body;
        const { authoremail } = item;
        const user = await userCollection.findOne({ authoremail });
        const hasMembership = user?.membership === 'subscribed';
        if (!hasMembership) {
          const postCount = await postCollection.countDocuments({ authoremail });
          const maxPosts = user?.maxPosts || 5;
          if (postCount >= maxPosts) {
            return res.status(400).send({
              message: `You have reached your post limit of ${maxPosts}. Please become a member to post more.`,
            });
          }
        }
        const result = await postCollection.insertOne(item);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: 'Error posting new post', error });
      }
    });




    app.get("/posts", async (req, res) => {
      try {
        const { email, search, tags, sortByPopularity } = req.query;

        const filter = {};

        if (email) {
          filter.authoremail = email;
        }

        if (search) {
          filter.$or = [
            { posttitle: { $regex: search, $options: "i" } },
            { postdescription: { $regex: search, $options: "i" } },
          ];
        }

        if (tags) {
          filter.tags = { $all: tags.split(",") };
        }

        const sort = sortByPopularity === "true"
          ? { voteDifference: -1 }
          : { createdAt: -1 };

        const posts = await postCollection.aggregate([
          { $match: filter },
          {
            $addFields: {
              upvote: { $ifNull: ["$upvote", 0] },
              downvote: { $ifNull: ["$downvote", 0] },
              voteDifference: { $subtract: [{ $ifNull: ["$upvote", 0] }, { $ifNull: ["$downvote", 0] }] },
            },
          },
          { $sort: sort },
        ]).toArray();

        res.json(posts);
      } catch (error) {
        res.status(500).send({ message: 'Error fetching posts', error });
      }
    });


    //payment
    app.post('/create-payment-intent', async (req, res) => {
      const { price } = req.body;
      const amount = Math.round(price * 100);

      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: 'usd',
          payment_method_types: ['card'],
        });

        res.send({
          clientSecret: paymentIntent.client_secret,
        });
      } catch (error) {
        console.error('Error creating payment intent:', error);
        res.status(500).send({ error: error.message });
      }
    });



    app.post('/payments', async (req, res) => {
      const payment = req.body;
      const paymentResult = await paymentCollection.insertOne(payment);
      console.log(payment);
      res.send(paymentResult);
    });

    app.post('/update-membership', async (req, res) => {
      const { email, paymentId } = req.body;
      try {
        const payment = await paymentCollection.findOne({ paymentId });
        if (!payment) {
          return res.status(400).send({ success: false, message: 'Payment not found or invalid' });
        }

        const user = await userCollection.findOneAndUpdate(
          { email },
          { $set: { badge: 'gold', membership: 'subscribed', maxPosts: 10 } },
          { returnDocument: "after" }
        )
        if (user) {
          res.status(200).send({ success: true, user });
        } else {
          res.status(404).send({ success: false, message: 'User not found' });
        }
      } catch (error) {
        res.status(500).send({ success: false, error: error.message });
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


    // for adding Comments


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

