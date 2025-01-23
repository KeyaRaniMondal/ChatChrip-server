const express = require('express');
const stripe = require('stripe')('STRIPE_SECRET_KEY');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const app = express();
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const port = process.env.PORT || 5000;

app.use(cors({
  origin: ['http://localhost:5173'],
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
    await client.connect();
    console.log("Connected to MongoDB!");

    app.get('/', (req, res) => {
      res.send('Forum is running');
    });

    const userCollection = client.db("ForumWebsite").collection("users");
    const postCollection = client.db("ForumWebsite").collection("posts");
    const paymentCollection = client.db("ForumWebsite").collection("payments");
    const commentCollection = client.db("ForumWebsite").collection("comments");
    const announceCollection = client.db("ForumWebsite").collection("announcements");


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
    
      if (!user.email) {
        return res.status(400).send({ message: 'Email is required.' });
      }
    
      try {
        const existingUser = await userCollection.findOne({ email: user.email });
        if (existingUser) {
          return res.status(409).send({ message: 'User already exists.' });
        }
    
        const result = await userCollection.insertOne(user);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: 'Failed to create user', error });
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


    // app.post('/posts', async (req, res) => {
    //   try {
    //     const item = req.body;
    //     const { authoremail } = item;

    //     // Count the user's posts before allowing to post a new one
    //     const postCount = await postCollection.countDocuments({ authoremail });

    //     const user = await userCollection.findOne({ authoremail });
    //     const maxPosts = user?.maxPosts || 5;

    //     if (postCount >= maxPosts) {
    //       return res.status(400).send({ message: `You have reached your post limit of ${maxPosts}.` });
    //     }

    //     // if (postCount >= 5) {
    //     //   return res.status(400).send({ message: "You have reached the limit of 5 posts. Please become a member to post more." });
    //     // }

    //     const result = await postCollection.insertOne(item);
    //     res.send(result);
    //   } catch (error) {
    //     res.status(500).send({ message: 'Error posting new post', error });
    //   }
    // });


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


    //for comments
    app.post('/posts/:postId/comments',verifyToken, async (req, res) => {
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




    //payment
    app.post('/create-payment-intent',verifyToken, async (req, res) => {
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

    app.post('/update-membership',verifyAdmin ,verifyToken, async (req, res) => {
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
    app.get('/posts/:id',verifyToken, async (req, res) => {
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
    app.get("/announcements", async (req, res) => {
      try {
        const announcements = await announceCollection.find().toArray();
        res.send(announcements);
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch announcements" });
      }
    });

    app.post('/announcements',verifyAdmin ,verifyToken, async (req, res) => {
      const announcement = req.body;
      const announceResult = await announceCollection.insertOne(announcement);
      console.log(announcement);
      res.send(announceResult);
    });


    // app.get('/admin/stats', async (req, res) => {
    //   try {
    //     const admin = await userCollection.findOne({ role: 'admin' }); // Assuming admin's role is set to 'admin'
    //     const totalPosts = await postCollection.countDocuments();
    //     const totalComments = await commentCollection.countDocuments();
    //     const totalUsers = await userCollection.countDocuments();
    
    //     res.send({
    //       admin: {
    //         name: admin.name,
    //         email: admin.email,
    //         image: admin.image, // Assuming admin has an image field
    //         posts: admin.posts || 0, // Admin's posts count
    //         comments: admin.comments || 0, // Admin's comments count
    //       },
    //       stats: {
    //         totalPosts,
    //         totalComments,
    //         totalUsers,
    //       },
    //     });
    //   } catch (error) {
    //     console.error('Error fetching admin stats:', error);
    //     res.status(500).send({ message: 'Failed to fetch admin stats', error });
    //   }
    // });
    
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

