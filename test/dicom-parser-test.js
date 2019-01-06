const assert = require('assert');
const base = require("../src/base");
const Tag = require("../src/tag");
const parser = require("../src/dicom-parser");
const data = require("./test-data");
const util = require("./util");

const version = "v2";

describe('A parse flow', function () {

    it('should produce a preamble, FMI tags and dataset tags for a complete DICOM file', function (done) {

        let bytes = base.concatv(data.preamble, data.fmiGroupLength(data.transferSyntaxUID()), data.transferSyntaxUID(), data.patientNameJohnDoe());

        util.streamSingle(bytes)
            .pipe(new parser.ParseFlow())
            .pipe(util.arraySink(parts => {
                util.expectPreamble(parts);
                util.expectHeader(parts, Tag.FileMetaInformationGroupLength);
                util.expectValueChunk(parts);
                util.expectHeader(parts, Tag.TransferSyntaxUID);
                util.expectValueChunk(parts);
                util.expectHeader(parts, Tag.PatientName);
                util.expectValueChunk(parts);
                util.expectDicomComplete(parts);
                done();
            }));

    });

});