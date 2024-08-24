import express from 'express'
import { problems , singleProblem, submissions} from '../controllers/userController.js'

const router = express.Router()

router.get('/problems' , problems)
router.get('/problem/:id' , singleProblem)
router.get('/submission' , submissions)

export default router