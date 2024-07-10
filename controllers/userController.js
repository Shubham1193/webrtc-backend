import Problem from "../models/questionModel.js";


export const problems = async(req,res,next) => {
    const problems = await Problem.find()
    // console.log(problems)
    res.status(200).send(problems)
}


export const singleProblem = async(req,res,next) => {
    const id = req.params.id
    console.log(id)
    const problem = await Problem.findById(id)
    res.status(200).send(problem)
}