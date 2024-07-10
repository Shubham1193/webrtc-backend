import express from 'express'
import { problems , singleProblem} from '../controllers/userController.js'

const router = express.Router()

router.get('/problems' , problems)
router.get('/problem/:id' , singleProblem)

export default router