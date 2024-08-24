import Problem from "../models/questionModel.js";
import Submission from "../models/submissionSchema.js";


export const problems = async(req,res,next) => {
    const problems = await Problem.find()
    // console.log(problems)
    res.status(200).send(problems)
}



export const submissions = async(req,res , next) => {
    const id = req.headers.id;
    const submission = await Submission.find({userId : id})
    res.status(200).send(submission)
    // res.status(200).send(id)
}

export const singleProblem = async(req,res,next) => {
    const id = req.params.id
    console.log(id)
    const problem = await Problem.findById(id)
    res.status(200).send(problem)
}