const chatAiRoutes = require("./chatAi");
const express = require('express');
require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const app = express();
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const port = process.env.PORT || 5000;
app.use(cors({
  origin: ['http://localhost:5173', 'https://forum-client-c31be.web.app', 'https://forum-client-c31be.firebaseapp.com'],
  // methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
};

const verifyToken = (req, res, next) => {
  const token = req?.cookies?.token;
  if (!token) {
    return res.status(401).send({ message: 'unAuthorized access' })
  }

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: 'unauthorized access' })
    }
    req.user = decoded;
    next();
  })

}

const uri = `mongodb+srv://${process.env.db_USER}:${process.env.db_PASSWORD}@cluster0.nj8v5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});


// for verifying admin
const verifyAdmin = async (req, res, next) => {
  const userEmail = req.user?.email;
  if (!userEmail) {
    return res.status(401).send({ message: 'Unauthorized' });
  }

  try {
    const user = await userCollection.findOne({ email: userEmail });
    if (!user) {
      return res.status(404).send({ message: 'User not found.' });
    }

    if (user.role !== 'admin') {
      return res.status(403).send({ message: 'Forbidden: Admins only.' });
    }
    next();
  } catch (error) {
    res.status(500).send({ message: 'Internal Server Error', error });
  }
};



async function run() {
  try {
    // await client.connect();
    // console.log("Connected to MongoDB!");
    //Integration of Ai


    app.get('/', (req, res) => {
      res.send('Forum is running');
    });

    const userCollection = client.db("ForumWebsite").collection("users");
    const postCollection = client.db("ForumWebsite").collection("posts");
    const paymentCollection = client.db("ForumWebsite").collection("payments");
    const commentCollection = client.db("ForumWebsite").collection("comments");
    const announceCollection = client.db("ForumWebsite").collection("announcements");
    const questionCollection = client.db("ForumWebsite").collection("questions");
    
const textAiCollection = client.db("ForumWebsite").collection("textAi");


    //using jwt 
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '5h' });

      res
        .cookie('token', token, cookieOptions)
        .send({ success: true })

    });

    app.post('/logOut', (req, res) => {
      res.clearCookie('token', { ...cookieOptions, maxAge: 0 })
        .send({ success: true })
    })

    // for AI

    
    app.use("/chatApi", chatAiRoutes)

    // for users
    app.get('/users', async (req, res) => {
      try {
        const users = await userCollection.find().toArray();
        res.send(users);
      } catch (error) {
        res.status(500).send({ message: 'Failed to fetch users', error });
      }
    });



    app.post('/users', async (req, res) => {
      const newUser = req.body;
      console.log('creating', newUser)
      const result = await userCollection.insertOne(newUser)
      res.send(result)
    })


    //For asking Questions
    app.post("/questions", async (req, res) => {
      try {
        const { title, description, user } = req.body;

        const question = {
          title,
          description,
          user,
          createdAt: new Date(),
        };

        const result = await questionCollection.insertOne(question);
        res.json({ id: result.insertedId, ...question });
      } catch (error) {
        console.error("Error saving question:", error);
        res.status(500).json({ message: "Error saving question" });
      }
    });
    

    //Fetch Questions
    app.get("/questions", async (req, res) => {
      try {
        const questions = await questionCollection.find().sort({ createdAt: -1 }).limit(10).toArray();
        res.json(questions);
      } catch (error) {
        console.error("Error fetching questions:", error);
        res.status(500).json({ message: "Error fetching questions" });
      }
    }
    )

    // Post an answer to a specific question
    app.post("/questions/:id/answers", async (req, res) => {
      try {
        const questionId = req.params.id;
        const { text, userName } = req.body;

        const answer = {
          text,
          userName,
          createdAt: new Date(),
        };

        const result = await questionCollection.updateOne(
          { _id: new ObjectId(questionId) },
          { $push: { answers: answer } }
        );

        if (result.modifiedCount === 0) {
          return res.status(404).json({ message: "Question not found" });
        }

        res.status(201).json({ message: "Answer added", answer });
      } catch (error) {
        console.error("Error posting answer:", error);
        res.status(500).json({ message: "Error posting answer" });
      }
    });

    // Get all answers for a specific question
    app.get("/questions/:id/answers", async (req, res) => {
      try {
        const questionId = req.params.id;

        const question = await questionCollection.findOne(
          { _id: new ObjectId(questionId) },
          { projection: { answers: 1 } }
        );

        if (!question) {
          return res.status(404).json({ message: "Question not found" });
        }

        res.json(question.answers || []);
      } catch (error) {
        console.error("Error fetching answers:", error);
        res.status(500).json({ message: "Error fetching answers" });
      }
    });


    // for creating Admin Role
    app.patch('/users/admin/:id', async (req, res) => {
      const { id } = req.params;

      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: 'Invalid user ID.' });
      }

      try {
        const user = await userCollection.findOne({ _id: new ObjectId(id) });
        if (!user) {
          return res.status(404).send({ message: 'User not found.' });
        }

        if (user.role === 'admin') {
          return res.status(400).send({ message: 'User is already an admin.' });
        }

        const result = await userCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { role: 'admin' } }
        );

        res.send({ message: 'User promoted to admin successfully.' });
      } catch (error) {
        res.status(500).send({ message: 'Failed to update user role.', error });
      }
    });


    app.get('/users/admin/:email', async (req, res) => {
      const email = req.params.email;

      try {
        const user = await userCollection.findOne({ email });

        if (!user) {
          return res.status(404).send({ admin: false, message: 'User not found' });
        }

        const isAdmin = user.role === 'admin';
        res.send({ admin: isAdmin });
      } catch (error) {
        console.error("Error verifying admin status:", error);
        res.status(500).send({ message: "Error verifying admin status" });
      }
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


    //delete post
    app.delete("/posts/:postId", async (req, res) => {
      const { postId } = req.params;

      try {
        const result = await postCollection.deleteOne({ _id: new ObjectId(postId) });

        if (result.deletedCount === 1) {
          res.json({ message: "Post deleted successfully" });
        } else {
          res.status(404).send({ message: "Post not found" });
        }
      } catch (error) {
        console.error("Error deleting post:", error);
        res.status(500).send({ message: "Error deleting post" });
      }
    });


    //for comments
    app.post('/posts/:postId/comments', verifyToken, async (req, res) => {
      const { postId } = req.params;
      const { text, authorEmail } = req.body;

      if (!text) {
        return res.status(400).send({ message: "Comment text is required." });
      }

      try {
        const comment = {
          postId: new ObjectId(postId),
          text,
          authorEmail,
          createdAt: new Date(),
        };

        const result = await commentCollection.insertOne(comment);

        res.status(201).send({ message: "Comment added successfully.", result });
      } catch (error) {
        console.error("Error adding comment:", error);
        res.status(500).send({ message: "Error adding comment.", error });
      }
    });

    app.get("/posts/:postId/comments", async (req, res) => {
      const { postId } = req.params;

      try {
        const comments = await commentCollection
          .find({ postId: new ObjectId(postId) })
          .sort({ createdAt: -1 })
          .toArray();

        res.json(comments);
      } catch (error) {
        console.error("Error fetching comments:", error);
        res.status(500).send({ message: "Error fetching comments", error });
      }
    });
    app.get("/comments", verifyToken, async (req, res) => {
      try {
        const comments = await commentCollection.find().toArray();
        res.send(comments);
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch comments" });
      }
    });



    //report Comment
    app.post('/comments/:commentId/report', async (req, res) => {
      const { commentId } = req.params;
      const { feedback } = req.body;

      try {
        const comment = await commentCollection.findById(commentId);
        if (!comment) return res.status(404).json({ message: 'Comment not found' });
        await ReportedComment.create({
          commentId: comment._id,
          authorEmail: comment.authorEmail,
          text: comment.text,
          feedback,
          reportedAt: new Date(),
        });

        res.status(200).json({ message: 'Comment reported successfully' });
      } catch (error) {
        res.status(500).json({ message: 'Error reporting comment', error });
      }
    });



    //payment
    app.post('/create-payment-intent', verifyToken, async (req, res) => {
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

    app.get('/payment-status/:email', async (req, res) => {
      const { email } = req.params;

      try {

        const payment = await paymentCollection.findOne({ email, status: "success" }, { sort: { date: -1 } });

        if (!payment) {
          return res.status(404).send({ success: false, message: 'No successful payment found.' });
        }

        res.status(200).send({ success: true, transactionId: payment.transactionId, price: payment.price });
      } catch (error) {
        res.status(500).send({ success: false, message: 'Error fetching payment status', error: error.message });
      }
    });




    //Post Details
    app.get('/posts/:id', verifyToken, async (req, res) => {
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

    //for announcements
    app.get("/announcements", verifyToken, async (req, res) => {
      try {
        const announcements = await announceCollection.find().toArray();
        res.send(announcements);
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch announcements" });
      }
    });

    app.post('/announcements', async (req, res) => {
      const announcement = req.body;
      const announceResult = await announceCollection.insertOne(announcement);
      console.log(announcement);
      res.send(announceResult);
    });



    // Ping the database
    // await client.db("admin").command({ ping: 1 });
    // console.log("Pinged your deployment. Successfully connected to MongoDB!");
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

