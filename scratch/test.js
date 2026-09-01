import { TextPreprocessor } from '../src/textpreprocessor.js';
const tp = new TextPreprocessor();
console.log(tp.process("$400m"));
console.log(tp.process("$400 million"));
console.log(tp.process("$400 mil"));
console.log(tp.process("$400 billion"));
console.log(tp.process("$400k"));
console.log(tp.process("$400 thousand"));
