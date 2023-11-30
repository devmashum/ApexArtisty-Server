const express = require('express');
const app = express();
const cors = require('cors');
var jwt = require('jsonwebtoken');
require('dotenv').config()
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const port = process.env.PORT || 3000;

// Middleware 
app.use(cors({
    origin: [

        'https://apexartistry-47b43.web.app',
        'https://apexartistry-47b43.firebaseapp.com'

    ],
}));
app.use(express.json());




const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.oqyepgg.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();

        const artsCollection = client.db('ApexArtistry').collection('arts');
        const usersCollection = client.db('ApexArtistry').collection('users');
        const cartCollection = client.db('ApexArtistry').collection('cart');
        const contactCollection = client.db('ApexArtistry').collection('contact');
        const contestCollection = client.db('ApexArtistry').collection('contest');
        const reviewsCollection = client.db('ApexArtistry').collection('reviews');
        const paymentsCollection = client.db('ApexArtistry').collection('payments');

        // Payment with Stripe
        app.post("/create-payment-intent", async (req, res) => {
            const { price } = req.body;
            // stripe calculate the price in cent so * with 100
            const amount = parseInt(price * 100);

            // Create a PaymentIntent with the order amount and currency
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: "usd",
                payment_method_types: [
                    "card"
                ]
                // In the latest version of the API, specifying the `automatic_payment_methods` parameter is optional because Stripe enables its functionality by default.

            });

            res.send({
                clientSecret: paymentIntent.client_secret,
            });
        });
        // Post Payments data to database
        app.post('/payments', async (req, res) => {
            const payment = req.body;
            const paymentResult = await paymentsCollection.insertOne(payment);
            // carefully delete each item from the cart
            const query = {
                _id: {
                    $in: payment.cartIds.map(id => new ObjectId(id))
                }
            };
            const deleteResult = await cartCollection.deleteMany(query);
            res.send({ paymentResult, deleteResult })
        })


        // Middleware /Verify token 
        const verifyToken = (req, res, next) => {
            // console.log('inside verify token', req.headers);
            if (!req.headers.authorization) {
                return res.status(401).send({ message: 'unauthorized access' })
            }
            const token = req.headers.authorization.split(' ')[1];
            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
                if (err) {
                    return res.status(401).send({ message: 'unauthorized access' })
                }
                req.decoded = decoded;
                next()
            })

            // next()
        }

        // use verify admin after verifyToken
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            const isAdmin = user?.role === 'admin';
            if (!isAdmin) {
                return res.status(403).send({ message: 'forbidden access' });
            }
            next()
        }

        // Verify admin with email
        app.get('/users/admin/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            if (email !== req.decoded.email) {
                return res.status(403).send({ message: 'forbidden access' })
            }
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            let admin = false;
            if (user) {
                admin = user?.role === 'admin';
            }
            res.send({ admin })
        })
        // use verify Creator after verifyToken
        const verifyCreator = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            const isCreator = user?.role1 === 'creator';
            if (!isCreator) {
                return res.status(403).send({ message: 'forbidden access' });
            }
            next()
        }


        // app.get('/arts/:id', async (req, res) => {
        //     const id = req.params.id;
        //     const query = { _id: new ObjectId(id) };
        //     const result = await artsCollection.findOne(query);
        //     res.send(result);
        // })
        // get data from payments and show the data to payment history

        // app.get('/payments/:email', async (req, res) => {
        //     const query = { email: req.params.email };
        //     if (req.params.email !== req.decoded.email) {
        //         return res.status(403).send({ message: 'forbidden access' });
        //     }
        //     const result = await paymentsCollection.find(query).toArray();
        //     res.send(result)

        // })

        app.get('/payments', async (req, res) => {
            const email = req.query.email;
            const query = { email: email };
            const result = await paymentsCollection.find(query).toArray();
            res.send(result);
        })
        // Verify admin with email
        app.get('/users/creator/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            if (email !== req.decoded.email) {
                return res.status(403).send({ message: 'forbidden access' })
            }
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            let creator = false;
            if (user) {
                creator = user?.role1 === 'creator';
            }
            res.send({ creator })
        })

        // get arts by the creator and show the arts in admin panel
        app.get('/arts', async (req, res) => {
            const cursor = artsCollection.find();
            const result = await cursor.toArray();
            res.send(result)
        })
        app.get('/arts/slider', async (req, res) => {
            const cursor = artsCollection.find();
            const result = await cursor.toArray();
            res.send(result)
        })
        // get the submitted content from the arts for the specific creator 
        app.get('/arts/creator', async (req, res) => {
            const email = req.query.email;
            const query = { email: email };
            const result = await artsCollection.find(query).toArray();
            res.send(result);
        })
        // delete a art from the admin panel
        app.delete('/arts/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await artsCollection.deleteOne(query);
            res.send(result);
        })
        // make a creator winner 
        app.patch('/arts/winner/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    role: 'winner'
                }
            }
            const result = await artsCollection.updateOne(filter, updatedDoc);
            res.send(result);
        })


        // add contest from the creator 
        app.post('/arts', async (req, res) => {
            const newContest = req.body;
            const result = await artsCollection.insertOne(newContest);
            res.send(result)
        })

        // User Collections
        app.post('/users', async (req, res) => {
            const user = req.body;
            const query = { email: user.email }
            const existingUser = await usersCollection.findOne(query);
            if (existingUser) {
                return res.send({ message: 'user already exists', insertedId: null })
            }
            const result = await usersCollection.insertOne(user);
            res.send(result);
        })


        // Add to cart 
        app.post('/cart', async (req, res) => {
            const newItem = req.body;
            const result = await cartCollection.insertOne(newItem);
            res.send(result)
        })
        // get data from the cart
        app.get('/cart', async (req, res) => {
            const email = req.query.email;
            const query = { email: email };
            const result = await cartCollection.find(query).toArray();
            res.send(result);
        })
        // get cartId from cart Data
        app.get('/cart', async (req, res) => {
            const result = await cartCollection.find().toArray();
            res.send(result);
        })

        // Delete Item from Cart
        app.delete('/cart/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await cartCollection.deleteOne(query);
            res.send(result);
        })
        // Load Users from the database
        app.get('/users', verifyToken, async (req, res) => {
            // console.log(req.headers);
            const result = await usersCollection.find().toArray();
            res.send(result);
        })
        // Delete User from DataBase
        app.delete('/users/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await usersCollection.deleteOne(query);
            res.send(result);
        })
        // Update a user Role
        app.patch('/users/admin/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    role: 'admin'
                }
            }
            const result = await usersCollection.updateOne(filter, updatedDoc);
            res.send(result);
        })
        // update a user to creator

        app.patch('/users/creator/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    role1: 'creator'
                }
            }
            const result = await usersCollection.updateOne(filter, updatedDoc);
            res.send(result);
        })
        // 
        app.get('/arts/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await artsCollection.findOne(query);
            res.send(result);
        })

        // JWT related API
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
                expiresIn: '1h'
            });
            res.send({ token })
        })

        // Contact Details send to DataBase
        app.post('/contact', async (req, res) => {
            const newContact = req.body;
            const result = await contactCollection.insertOne(newContact);
            res.send(result)
        })
        // Add all Contest to the database
        app.post('/contest', async (req, res) => {
            const newContest = req.body;
            const result = await contestCollection.insertOne(newContest);
            res.send(result)
        })
        // get contact Data from DataBank
        app.get('/contact', async (req, res) => {
            const result = await contactCollection.find().toArray();
            res.send(result);
        })

        // get reviews from data 
        app.get('/reviews', async (req, res) => {
            const result = await reviewsCollection.find().toArray();
            res.send(result);
        })

        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('server is running')
})

app.listen(port, () => {
    console.log(`server is running on port ${port}`)
})