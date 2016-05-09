StringHelper = function() {}

var p = StringHelper.prototype

// A pad helper
// Taken from http://stackoverflow.com/a/24398129/1741150
p.pad = function (pad_char, pad_size, str, padLeft) {
  var pad = Array(pad_size).join(pad_char);
  if (typeof str === 'undefined') 
    return pad;
  if (padLeft) {
    return (pad + str).slice(-pad.length);
  } else {
    return (str + pad).substring(0, pad.length);
  }
}

p.enclose = function(text, start_str, end_str, words_array) {
  for (var j = 0; j < words_array.length; j++) {
    text = text.replace(new RegExp('('+words_array[j]+')', 'gi'), start_str + words_array[j] + end_str);
  }
  return text;
}

p.highlight = function(text, words_array) {
  return this.enclose(text, "<highlight>", "</highlight>", words_array);
}
p.code = function(text, words_array) {
  return this.enclose(text, "`", "`", words_array);
}
module.exports = StringHelper
