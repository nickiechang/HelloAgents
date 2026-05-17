// ReAct Agent实现 - 推理与行动结合的智能体
import { Agent } from '../core/agent.js';
import { Message } from '../core/message.js';
import { ToolRegistry } from '../tools/registry.js';

const DEFAULT_REACT_PROMPT = `你是一个具备推理和行动能力的AI助手。你可以通过思考分析问题，然后调用合适的工具来获取信息，最终给出准确的答案。

## 可用工具
{tools}

## 工作流程
请严格按照以下格式进行回应，每次只能执行一个步骤：

Thought: 分析问题，确定需要什么信息，制定研究策略。
Action: 选择合适的工具获取信息，格式为：
- \`{tool_name}[{tool_input}]\`：调用工具获取信息。
- \`Finish[研究结论]\`：当你有足够信息得出结论时。

## 当前任务
**Question:** {question}

## 执行历史
{history}

现在开始你的推理和行动：`;

export class ReActAgent extends Agent {
  constructor(name, llm, { toolRegistry = null, systemPrompt = null, config = null, maxSteps = 5, customPrompt = null } = {}) {
    super(name, llm, systemPrompt, config);
    this.toolRegistry = toolRegistry || new ToolRegistry();
    this.maxSteps = maxSteps;
    this.currentHistory = [];
    this.promptTemplate = customPrompt || DEFAULT_REACT_PROMPT;
  }

  addTool(tool) {
    this.toolRegistry.registerTool(tool);
  }

  async run(inputText, kwargs = {}) {
    this.currentHistory = [];
    let currentStep = 0;

    console.log(`\n🤖 ${this.name} 开始处理问题: ${inputText}`);

    while (currentStep < this.maxSteps) {
      currentStep++;
      console.log(`\n--- 第 ${currentStep} 步 ---`);

      const toolsDesc = this.toolRegistry.getToolsDescription();
      const historyStr = this.currentHistory.join('\n');
      const prompt = this.promptTemplate
        .replace('{tools}', toolsDesc)
        .replace('{question}', inputText)
        .replace('{history}', historyStr);

      const messages = [{ role: 'user', content: prompt }];
      const responseText = await this.llm.invoke(messages, kwargs);

      if (!responseText) {
        console.log('❌ 错误：LLM未能返回有效响应。');
        break;
      }

      const [thought, action] = this._parseOutput(responseText);
      if (thought) console.log(`🤔 思考: ${thought}`);
      if (!action) {
        console.log('⚠️ 警告：未能解析出有效的Action，流程终止。');
        break;
      }

      if (action.startsWith('Finish')) {
        const finalAnswer = this._parseActionInput(action);
        console.log(`🎉 最终答案: ${finalAnswer}`);
        this.addMessage(new Message(inputText, 'user'));
        this.addMessage(new Message(finalAnswer, 'assistant'));
        return finalAnswer;
      }

      const [toolName, toolInput] = this._parseAction(action);
      if (!toolName || toolInput == null) {
        this.currentHistory.push('Observation: 无效的Action格式，请检查。');
        continue;
      }

      console.log(`🎬 行动: ${toolName}[${toolInput}]`);
      const observation = this.toolRegistry.executeTool(toolName, toolInput);
      console.log(`👀 观察: ${observation}`);

      this.currentHistory.push(`Action: ${action}`);
      this.currentHistory.push(`Observation: ${observation}`);
    }

    console.log('⏰ 已达到最大步数，流程终止。');
    const finalAnswer = '抱歉，我无法在限定步数内完成这个任务。';
    this.addMessage(new Message(inputText, 'user'));
    this.addMessage(new Message(finalAnswer, 'assistant'));
    return finalAnswer;
  }

  _parseOutput(text) {
    const thoughtMatch = text.match(/Thought: (.*)/);
    const actionMatch = text.match(/Action: (.*)/);
    return [
      thoughtMatch ? thoughtMatch[1].trim() : null,
      actionMatch ? actionMatch[1].trim() : null,
    ];
  }

  _parseAction(actionText) {
    const match = actionText.match(/(\w+)\[(.*)\]/);
    if (match) return [match[1], match[2]];
    return [null, null];
  }

  _parseActionInput(actionText) {
    const match = actionText.match(/\w+\[(.*)\]/);
    return match ? match[1] : '';
  }
}
