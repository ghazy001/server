let summarizer;

async function summarizeText(text, maxLength = 200) {
  if (!summarizer) {
    const { pipeline } = await import('@xenova/transformers');  // Import dynamique
    summarizer = await pipeline('summarization', 'Xenova/distilbart-cnn-6-6');
  }

  const result = await summarizer(text, {
    max_length: maxLength,  // Use the passed max_length
    min_length: 10,
    do_sample: false,
  });

  return result[0].summary_text;
}

module.exports = { summarizeText };
