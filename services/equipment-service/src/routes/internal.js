const express=require('express');
const config=require('../config');
const router=express.Router();
router.use((req,res,next)=>req.get('x-internal-api-key')===config.internalApiKey?next():res.status(403).json({error:{code:'FORBIDDEN',message:'Forbidden'}}));
router.get('/events/:id/readiness',async(req,res)=>res.json(await require('../readiness').preview(req.params.id)));
router.post('/events/:id/readiness/prepare',async(req,res)=>res.json(await require('../readiness').prepare(req.params.id,req.body||{})));
router.post('/events/:id/readiness/release',async(req,res)=>res.json(await require('../readiness').release(req.params.id,req.body?.token)));
module.exports=router;
