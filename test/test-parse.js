const fs = require("fs");
const pipe = require("multipipe");
const {TagPath} = require("../src/tag-path");
const {TagTree} = require("../src/tag-tree");
const {printFlow} = require("../src/flows");
const {whitelistFilter, blacklistFilter, toUtf8Flow, toIndeterminateLengthSequences} = require("../src/dicom-flows");
const {modifyFlow, TagModification, TagInsertion} = require("../src/modify-flow");
const {elementFlow} = require("../src/element-flows");
const {elementSink} = require("../src/element-sink");

const {parseFlow} = require("../src/dicom-parser");

const src = fs.createReadStream(process.argv[2]);

pipe(
    src,
    parseFlow(),
    toIndeterminateLengthSequences(),
    toUtf8Flow(),
    whitelistFilter([
        TagTree.fromTag(Tag.SpecificCharacterSet),
        TagTree.fromTag(Tag.PatientName),
        TagTree.fromTag(Tag.PatientName),
        TagTree.fromTag(Tag.StudyDescription),
        TagTree.fromTag(Tag.SeriesDate),
        TagTree.fromAnyItem(Tag.MACParametersSequence)
    ]),
    blacklistFilter([
        TagTree.fromAnyItem(Tag.MACParametersSequence).thenTag(Tag.DataElementsSigned)
    ]),
    modifyFlow([
        TagModification.equals(TagPath.fromTag(Tag.PatientName), () => Buffer.from("Anon 001"))
    ], [
        new TagInsertion(TagPath.fromTag(Tag.PatientIdentityRemoved), () => Buffer.from("YES"))
    ]),
    elementFlow(),
    elementSink(elements => {
        console.log(elements.toString());
    })
);

